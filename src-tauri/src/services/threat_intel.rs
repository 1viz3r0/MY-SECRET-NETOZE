use crate::database::sqlite::{load_threat_matches, upsert_threat_match};
use crate::models::{ThreatIntelStatus, ThreatMatchEntry};
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Emitter;

const FEEDS: &[(&str, &str)] = &[
    (
        "sslbl",
        "https://sslbl.abuse.ch/blacklist/sslipblacklist.csv",
    ),
    (
        "feodo",
        "https://feodotracker.abuse.ch/downloads/ipblocklist_recommended.txt",
    ),
    (
        "feodo-full",
        "https://feodotracker.abuse.ch/downloads/ipblocklist.txt",
    ),
];

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub struct ThreatIntelState {
    pub iocs: Arc<Mutex<HashMap<String, ThreatMatchEntry>>>,
    pub last_fetched: Arc<Mutex<Option<String>>>,
    pub fetch_error: Arc<Mutex<Option<String>>>,
    pub running: Arc<AtomicBool>,
}

impl ThreatIntelState {
    pub fn new() -> Self {
        Self {
            iocs: Arc::new(Mutex::new(HashMap::new())),
            last_fetched: Arc::new(Mutex::new(None)),
            fetch_error: Arc::new(Mutex::new(None)),
            running: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn status(&self) -> ThreatIntelStatus {
        let iocs = self.iocs.lock().unwrap();
        let mut sources: Vec<String> = iocs.values().map(|m| m.feed.clone()).collect();
        sources.sort();
        sources.dedup();
        let match_count = load_threat_matches(500).len();
        ThreatIntelStatus {
            feed_state: if self.fetch_error.lock().unwrap().is_some() {
                "ERROR".to_string()
            } else if !iocs.is_empty() {
                "LOADED".to_string()
            } else {
                "EMPTY".to_string()
            },
            last_fetched: self.last_fetched.lock().unwrap().clone(),
            ioc_count: iocs.len(),
            match_count,
            sources,
        }
    }

    pub fn lookup_ip(&self, ip: &str) -> Option<ThreatMatchEntry> {
        self.iocs.lock().unwrap().get(ip).cloned()
    }
}

pub fn start_threat_intel_worker(state: Arc<ThreatIntelState>, app_handle: tauri::AppHandle) {
    if state.running.swap(true, Ordering::SeqCst) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        loop {
            match fetch_feeds().await {
                Ok(entries) => {
                    let mut map = state.iocs.lock().unwrap();
                    map.clear();
                    for e in entries {
                        map.insert(e.ip.clone(), e);
                    }
                    drop(map);
                    *state.last_fetched.lock().unwrap() = Some(chrono::Utc::now().to_rfc3339());
                    *state.fetch_error.lock().unwrap() = None;
                    tracing::info!(
                        "🛡️ Threat intel feeds refreshed: {} IOC(s)",
                        state.iocs.lock().unwrap().len()
                    );
                    let _ = app_handle.emit("threatintel-status", state.status());
                }
                Err(err) => {
                    *state.fetch_error.lock().unwrap() = Some(err.clone());
                    tracing::warn!("🛡️ Threat intel fetch failed: {}", err);
                    let _ = app_handle.emit("threatintel-status", state.status());
                }
            }
            tokio::time::sleep(Duration::from_secs(3600)).await;
        }
    });
}

pub async fn fetch_feeds() -> Result<Vec<ThreatMatchEntry>, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(25))
        .build()
        .map_err(|e| e.to_string())?;

    let mut collected: HashMap<String, ThreatMatchEntry> = HashMap::new();
    let mut seen: HashSet<String> = HashSet::new();
    let mut last_err: Option<String> = None;

    for (feed, url) in FEEDS {
        match client.get(*url).send().await {
            Ok(resp) if resp.status().is_success() => {
                let Ok(text) = resp.text().await else { continue };
                for line in text.lines().take(20_000) {
                    let line = line.trim();
                    if line.is_empty() || line.starts_with('#') {
                        continue;
                    }
                    let (ip, first_seen) = match *feed {
                        "sslbl" => {
                            // CSV: timestamp,ip,port,...
                            let parts: Vec<&str> = line.split(',').collect();
                            if parts.len() < 2 {
                                continue;
                            }
                            (parts[1].trim().to_string(), Some(parts[0].trim().to_string()))
                        }
                        _ => (line.to_string(), None),
                    };
                    if ip.is_empty() || !seen.insert(ip.clone()) {
                        continue;
                    }
                    collected.insert(
                        ip.clone(),
                        ThreatMatchEntry {
                            ip,
                            indicator_type: "IP".to_string(),
                            feed: feed.to_string(),
                            severity: "HIGH".to_string(),
                            feed_first_seen: first_seen,
                            feed_last_seen: None,
                            matched_at: now_ms(),
                        },
                    );
                }
                tracing::info!("🛡️ Feed {} parsed", feed);
            }
            Ok(resp) => {
                last_err = Some(format!("{} returned HTTP {}", feed, resp.status().as_u16()));
            }
            Err(e) => {
                last_err = Some(format!("{} unreachable: {}", feed, e));
            }
        }
    }

    if collected.is_empty() {
        return Err(last_err.unwrap_or_else(|| "All feeds returned no indicators".to_string()));
    }
    Ok(collected.into_values().collect())
}

/// Scores a batch of IPs against the in-memory IOC set; matches get persisted.
pub fn evaluate_ips_for_threats(
    state: &ThreatIntelState,
    ips: &[String],
    max_matches: usize,
) -> Vec<ThreatMatchEntry> {
    let iocs = state.iocs.lock().unwrap();
    let mut matches = Vec::new();
    for ip in ips {
        if let Some(m) = iocs.get(ip) {
            if matches.len() >= max_matches {
                break;
            }
            let match_entry = ThreatMatchEntry {
                matched_at: now_ms(),
                ..m.clone()
            };
            upsert_threat_match(&match_entry);
            matches.push(match_entry);
        }
    }
    matches
}

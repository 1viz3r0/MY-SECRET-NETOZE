use crate::database::sqlite::{load_geoip, upsert_geoip};
use crate::models::GeoIpEntry;
use std::collections::HashSet;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// Most requests must resolve their own public IP first; fallback on failure.
const PUBLIC_IP_ENDPOINTS: &[&str] = &["https://api.ipify.org"];

/// Local IPv4/6 prefixes that must NOT be sent to external GeoIP providers.
fn is_private_ip(ip: &str) -> bool {
    let Ok(parsed) = ip.parse::<std::net::IpAddr>() else {
        return true;
    };
    match parsed {
        std::net::IpAddr::V4(v4) => {
            v4.is_private()
                || v4.is_loopback()
                || v4.is_link_local()
                || v4.is_broadcast()
                || v4.is_documentation()
                || v4.is_multicast()
                || v4.octets()[0] == 10
                || (v4.octets()[0] == 172 && (16..=31).contains(&v4.octets()[1]))
                || (v4.octets()[0] == 192 && v4.octets()[1] == 168)
        }
        std::net::IpAddr::V6(v6) => {
            let seg0 = v6.segments()[0];
            v6.is_loopback()
                || (seg0 & 0xfe00) == 0xfc00 // unique-local
                || (seg0 & 0xffc0) == 0xfe80 // link-local
                || v6.is_multicast()
        }
    }
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub struct GeoIpService {
    pub cache_hits: Arc<AtomicU64>,
    pub cache_misses: Arc<AtomicU64>,
    pub last_public_ip: Arc<Mutex<Option<String>>>,
}

impl GeoIpService {
    pub fn new() -> Self {
        Self {
            cache_hits: Arc::new(AtomicU64::new(0)),
            cache_misses: Arc::new(AtomicU64::new(0)),
            last_public_ip: Arc::new(Mutex::new(None)),
        }
    }

    pub fn is_private(&self, ip: &str) -> bool {
        is_private_ip(ip)
    }

    /// Resolves the machine's own public IPv4 (used to draw our node on the globe).
    pub async fn resolve_public_ip(&self) -> Option<String> {
        if let Some(cached) = self.last_public_ip.lock().unwrap().clone() {
            return Some(cached);
        }
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .ok()?;
        for endpoint in PUBLIC_IP_ENDPOINTS {
            if let Ok(resp) = client.get(*endpoint).send().await {
                if let Ok(ip) = resp.text().await {
                    let ip = ip.trim().to_string();
                    if !ip.is_empty() && !is_private_ip(&ip) {
                        *self.last_public_ip.lock().unwrap() = Some(ip.clone());
                        return Some(ip);
                    }
                }
            }
        }
        None
    }

    /// GeoIP lookup with SQLite cache (30-day TTL). Private IPs return a synthetic local entry.
    pub async fn lookup(&self, ip: &str) -> Option<GeoIpEntry> {
        if is_private_ip(ip) {
            return Some(local_entry(ip));
        }

        if let Some(cached) = load_geoip(ip) {
            let age_ms = now_ms().saturating_sub(cached.resolved_at);
            if age_ms < 30 * 24 * 3600 * 1000 {
                self.cache_hits.fetch_add(1, Ordering::Relaxed);
                return Some(cached);
            }
        }
        self.cache_misses.fetch_add(1, Ordering::Relaxed);

        let entry = self.fetch_remote(ip).await;
        if let Some(ref e) = entry {
            upsert_geoip(e);
        }
        entry
    }

    async fn fetch_remote(&self, ip: &str) -> Option<GeoIpEntry> {
        // Provider fallback chain: bigdatacloud (may 403 without key), then keyless
        // ipwho.is, then keyless ipapi.co. Each provider parsed with its own schema.
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(6))
            .build()
            .ok()?;

        let bigdatacloud_url = format!(
            "https://api.bigdatacloud.net/data/ip-geolocation-with-confidence?ip={}&localityLanguage=en",
            ip
        );
        if let Ok(resp) = client.get(&bigdatacloud_url).send().await {
            if resp.status().is_success() {
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    let location = &json["location"];
                    if let Some(country_code) = json["country"]["isoCode"].as_str() {
                        if country_code.len() == 2 {
                            return Some(GeoIpEntry {
                                ip: ip.to_string(),
                                country: json["country"]["name"]
                                    .as_str()
                                    .unwrap_or(country_code)
                                    .to_string(),
                                country_code: country_code.to_string(),
                                city: location["city"]
                                    .as_str()
                                    .unwrap_or("Unknown")
                                    .to_string(),
                                latitude: location["latitude"].as_f64(),
                                longitude: location["longitude"].as_f64(),
                                asn: json["network"]["carriers"]
                                    .as_array()
                                    .and_then(|c| c.first())
                                    .and_then(|c| c["asn"].as_str())
                                    .map(|s| s.to_string()),
                                org: json["network"]["carriers"]
                                    .as_array()
                                    .and_then(|c| c.first())
                                    .and_then(|c| c["name"].as_str())
                                    .map(|s| s.to_string())
                                    .or_else(|| {
                                        json["network"]["organisation"]
                                            .as_str()
                                            .map(|s| s.to_string())
                                    }),
                                source: "bigdatacloud".to_string(),
                                resolved_at: now_ms(),
                            });
                        }
                    }
                }
            }
        }

        let ipwhois_url = format!("https://ipwho.is/{}", ip);
        if let Ok(resp) = client.get(&ipwhois_url).send().await {
            if resp.status().is_success() {
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    if json["success"].as_bool().unwrap_or(false) {
                        return Some(GeoIpEntry {
                            ip: ip.to_string(),
                            country: json["country"]
                                .as_str()
                                .unwrap_or("Unknown")
                                .to_string(),
                            country_code: json["country_code"]
                                .as_str()
                                .unwrap_or("XX")
                                .to_string(),
                            city: json["city"].as_str().unwrap_or("Unknown").to_string(),
                            latitude: json["latitude"].as_f64(),
                            longitude: json["longitude"].as_f64(),
                            asn: json["connection"]["asn"]
                                .as_i64()
                                .map(|n| format!("AS{}", n)),
                            org: json["connection"]["org"].as_str().map(|s| s.to_string()),
                            source: "ipwhois".to_string(),
                            resolved_at: now_ms(),
                        });
                    }
                }
            }
        }

        let ipapi_url = format!("https://ipapi.co/{}/json/", ip);
        if let Ok(resp) = client.get(&ipapi_url).send().await {
            if resp.status().is_success() {
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    if json["error"].as_bool().unwrap_or(false) {
                        return None;
                    }
                    return Some(GeoIpEntry {
                        ip: ip.to_string(),
                        country: json["country_name"]
                            .as_str()
                            .unwrap_or("Unknown")
                            .to_string(),
                        country_code: json["country_code"]
                            .as_str()
                            .unwrap_or("XX")
                            .to_string(),
                        city: json["city"].as_str().unwrap_or("Unknown").to_string(),
                        latitude: json["latitude"].as_f64(),
                        longitude: json["longitude"].as_f64(),
                        asn: json["asn"].as_str().map(|s| s.to_string()),
                        org: json["org"].as_str().map(|s| s.to_string()),
                        source: "ipapi".to_string(),
                        resolved_at: now_ms(),
                    });
                }
            }
        }

        None
    }

    /// Geocodes all currently active remote endpoints (public IPs only), throttled.
    pub async fn enrich_ips(&self, ips: &[String], max: usize) -> Vec<GeoIpEntry> {
        let mut seen = HashSet::new();
        let mut results = Vec::new();
        for ip in ips {
            if results.len() >= max {
                break;
            }
            if !seen.insert(ip.clone()) {
                continue;
            }
            if let Some(entry) = self.lookup(ip).await {
                results.push(entry);
            }
            tokio::time::sleep(Duration::from_millis(80)).await;
        }
        results
    }

    pub fn cache_stats(&self) -> (u64, u64) {
        (
            self.cache_hits.load(Ordering::Relaxed),
            self.cache_misses.load(Ordering::Relaxed),
        )
    }
}

fn local_entry(ip: &str) -> GeoIpEntry {
    GeoIpEntry {
        ip: ip.to_string(),
        country: "Local Network".to_string(),
        country_code: "LOCAL".to_string(),
        city: "LAN".to_string(),
        latitude: None,
        longitude: None,
        asn: None,
        org: None,
        source: "local".to_string(),
        resolved_at: now_ms(),
    }
}

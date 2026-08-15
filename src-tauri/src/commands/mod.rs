use reqwest::blocking::get;
use std::net::SocketAddr;
use std::process::Command;
use std::time::Duration;

use crate::audit_log::AuditLogEntry;

#[command]
pub fn audit_log(limit: Option<usize>) -> Result<Vec<AuditLogEntry>, String> {
    let limit = limit.unwrap_or(10).min(500);
    let conn = crate::db::get_connection()
        .map_err(|e| format!("Failed to open database: {}", e))?;
    let mut stmt = conn
        .prepare(
            "SELECT id, timestamp, actor, action, resource, prev_hash, curr_hash
             FROM audit_log ORDER BY id DESC LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([limit as i64], |r| {
            Ok(AuditLogEntry {
                id: r.get(0)?,
                timestamp: r.get(1)?,
                actor: r.get(2)?,
                action: r.get(3)?,
                resource: r.get(4)?,
                prev_hash: r.get(5)?,
                curr_hash: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        if let Ok(entry) = row {
            out.push(entry);
        }
    }
    Ok(out)
}

#[command]
pub fn ping_host(target: String, count: Option<usize>) -> Result<String, String> {
    let count = count.unwrap_or(4);
    let target = target.trim();
    if target.is_empty() {
        return Err("Target host cannot be empty".to_string());
    }
    // Use system ping command
    let output = std::process::Command::new("ping")
        .arg("-n")
        .arg(count.to_string())
        .arg("-w")
        .arg("1000")
        .arg(&target)
        .output()
        .map_err(|e| format!("Failed to execute ping: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined = format!("{}\n{}", stdout, stderr);
    
    if output.status.success() {
        Ok(combined)
    } else {
        Err(format!("Ping failed for {}: {}", target, combined))
    }
}

#[command]
pub fn check_port(_host: String, port: u16, _timeout: Option<u64>) -> Result<String, String> {
    unimplemented!()
}

#[command]
pub fn whois_rdap(_target: String) -> Result<String, String> {
    unimplemented!()
}

#[command]
pub fn traceroute(_target: String, _max_hops: Option<usize>) -> Result<String, String> {
    unimplemented!()
}

// === Packet Capture Commands ===

#[command]
pub fn inspect_npcap_availability() -> Result<(String, String), String> {
    use crate::services::platform::windows::inspect_npcap;
    let npcap = inspect_npcap();
    if npcap.installed {
        Ok(("AVAILABLE".to_string(), "Npcap Packet Capture Engine is installed and ready.".to_string()))
    } else {
        Ok(("UNAVAILABLE".to_string(), "Npcap is not installed or unavailable. Packet capture features are paused. Please install Npcap.".to_string()))
    }
}

#[command]
pub fn get_pcap_interfaces() -> Result<Vec<crate::models::NpcapInterface>, String> {
    use pcap::Device;
    match Device::list() {
        Ok(devs) => {
            Ok(devs.into_iter().map(|d| {
                let description = d.desc.clone().unwrap_or_else(|| d.name.clone());
                let is_loopback = d.name.to_lowercase().contains("loopback")
                    || description.to_lowercase().contains("loopback");
                crate::models::NpcapInterface {
                    id: d.name.clone(),
                    name: description.clone(),
                    description,
                    ipv4_addresses: Vec::new(),
                    ipv6_addresses: Vec::new(),
                    mac_address: String::new(),
                    is_loopback,
                }
            }).collect())
        }
        Err(_) => Ok(vec![]),
    }
}

#[command]
pub fn start_packet_capture(interface_id: String, app_handle: AppHandle) -> Result<(), String> {
    unsafe {
        if CAPTURE_ENGINE.is_none() {
            let flow_engine = FlowEngine::new();
            let ja4_engine = Ja4Engine::new();
            let detection_engine = DetectionEngine::new();
            let graph_engine = GraphEngine::new();
            let storyline_builder = StorylineBuilder::new();
            
            let engine = CaptureEngine::new(
                flow_engine,
                ja4_engine,
                detection_engine,
                graph_engine,
                storyline_builder,
            );
            set_capture_engine(engine);
        }
    }
    
    let engine = unsafe { CAPTURE_ENGINE.as_ref().unwrap() };
    engine.start_capture(interface_id, app_handle)
}

#[command]
pub fn stop_packet_capture(app_handle: AppHandle) {
    unsafe {
        if let Some(engine) = CAPTURE_ENGINE.as_ref() {
            engine.stop_capture(app_handle);
        }
    }
}

#[command]
pub fn get_capture_metrics() -> Result<CaptureMetrics, String> {
    unsafe {
        if let Some(engine) = CAPTURE_ENGINE.as_ref() {
            return Ok(engine.get_metrics("STOPPED"));
        }
    }
    Ok(CaptureMetrics {
        status: "STOPPED".to_string(),
        selected_interface: "".to_string(),
        packets_captured: 0,
        bytes_captured: 0,
        packets_per_sec: 0.0,
        bytes_per_sec: 0.0,
        dropped_packets: 0,
        duration_secs: 0,
    })
}
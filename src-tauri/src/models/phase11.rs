use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectivityStatus {
    /// ONLINE | DEGRADED | OFFLINE | CONNECTING | STALE
    pub state: String,
    /// Which endpoint reported the last result, e.g. "generate_204 (gstatic)"
    pub source: String,
    /// RFC3339 of last check attempt
    pub last_checked: String,
    /// RFC3339 of last successful check (None = never)
    pub last_success: Option<String>,
    /// Measured latency in ms of the last successful check
    pub latency_ms: Option<u64>,
    /// Human detail of the last check result
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeoIpEntry {
    pub ip: String,
    pub country: String,
    pub country_code: String,
    pub city: String,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub asn: Option<String>,
    pub org: Option<String>,
    pub source: String,
    /// unix ms of resolution
    pub resolved_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreatMatchEntry {
    pub ip: String,
    pub indicator_type: String,
    pub feed: String,
    pub severity: String,
    pub feed_first_seen: Option<String>,
    pub feed_last_seen: Option<String>,
    /// unix ms when NET0ZE matched the indicator against observed traffic
    pub matched_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreatIntelStatus {
    pub feed_state: String,
    pub last_fetched: Option<String>,
    pub ioc_count: usize,
    pub match_count: usize,
    pub sources: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceEntry {
    pub ip: String,
    pub mac: String,
    pub hostname: Option<String>,
    pub vendor: Option<String>,
    pub interface: Option<String>,
    pub first_seen: i64,
    pub last_seen: i64,
    pub active: bool,
    pub is_self: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortScanEntry {
    pub ip: String,
    pub port: u16,
    pub protocol: String,
    pub state: String,
    pub service: String,
    pub first_seen: i64,
    pub last_seen: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DnsQueryEntry {
    pub timestamp: String,
    pub client_ip: String,
    pub server_ip: String,
    pub qname: String,
    pub qtype: String,
    pub rcode: i16,
    pub answers: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalSubnet {
    pub cidr: String,
    pub adapter: String,
}

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetailedSystemInfo {
    pub hostname: String,
    pub os_name: String,
    pub os_version: String,
    pub architecture: String,
    pub cpu_model: String,
    pub cpu_core_count: usize,
    pub ram_total_bytes: u64,
    pub ram_available_bytes: u64,
    pub ram_usage_percent: f64,
    pub uptime_seconds: u64,
    pub user_name: String,
    pub is_admin: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetailedAdapterInfo {
    pub name: String,
    pub friendly_name: String,
    pub description: String,
    pub mac_address: String,
    pub ipv4_addresses: Vec<String>,
    pub ipv6_addresses: Vec<String>,
    pub oper_status: String,
    pub interface_type: String,
    pub rx_bytes: u64,
    pub tx_bytes: u64,
    pub rx_packets: u64,
    pub tx_packets: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TcpConnectionEntry {
    pub local_ip: String,
    pub local_port: u16,
    pub remote_ip: String,
    pub remote_port: u16,
    pub tcp_state: String,
    pub pid: u32,
    pub process_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowsEventEntry {
    pub timestamp: String,
    pub provider: String,
    pub event_id: u32,
    pub level: String,
    pub message: String,
    pub channel: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetryPayload {
    pub rx_kbps: f64,
    pub tx_kbps: f64,
    pub rx_packets_delta: u64,
    pub tx_packets_delta: u64,
    pub rtt_avg_ms: f64,
    pub active_tcp_count: usize,
    pub timestamp: String,
}

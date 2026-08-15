use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HostIdentity {
    pub hostname: String,
    pub os_family: String,
    pub os_version: String,
    pub architecture: String,
    pub app_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TcpSocketEntry {
    pub local_ip: String,
    pub local_port: u16,
    pub remote_ip: String,
    pub remote_port: u16,
    pub state: String, // LISTEN, ESTABLISHED, SYN_SENT, TIME_WAIT, CLOSE_WAIT, etc.
    pub pid: u32,
    pub process_name: String,
    pub executable_path: String,
    pub address_family: String, // IPv4, IPv6
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessEntry {
    pub pid: u32,
    pub process_name: String,
    pub executable_path: String,
    pub cpu_usage: f32,
    pub memory_bytes: u64,
    pub start_time: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkInterfaceEntry {
    pub interface_id: String,
    pub name: String,
    pub mac_address: String,
    pub ipv4_addresses: Vec<String>,
    pub ipv6_addresses: Vec<String>,
    pub operational_state: String, // UP, DOWN, UNKNOWN
    pub link_speed_mbps: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowsServiceEntry {
    pub service_name: String,
    pub display_name: String,
    pub state: String,      // RUNNING, STOPPED, PAUSED
    pub start_type: String, // AUTOMATIC, MANUAL, DISABLED
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SocketProcessCorrelation {
    pub correlation_id: String,
    pub flow_id: String,
    pub local_endpoint: String,
    pub remote_endpoint: String,
    pub pid: u32,
    pub process_name: String,
    pub confidence: String, // HIGH, MEDIUM, LOW, UNKNOWN
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemSnapshot {
    pub timestamp: u64,
    pub host_identity: HostIdentity,
    pub tcp_sockets: Vec<TcpSocketEntry>,
    pub processes: Vec<ProcessEntry>,
    pub interfaces: Vec<NetworkInterfaceEntry>,
    pub services: Vec<WindowsServiceEntry>,
    pub correlations: Vec<SocketProcessCorrelation>,
}

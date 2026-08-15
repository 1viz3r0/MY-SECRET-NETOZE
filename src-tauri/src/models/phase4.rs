use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlowRecord {
    pub flow_id: String,
    pub src_ip: String,
    pub dst_ip: String,
    pub src_port: u16,
    pub dst_port: u16,
    pub protocol: String,
    pub ip_version: u8,
    pub client_bytes: u64,
    pub server_bytes: u64,
    pub total_bytes: u64,
    pub packet_count: u64,
    pub tcp_state: String,
    pub ja4: String,
    pub threat_score: u32,
    pub severity: String,
    pub ts_start: u64,
    pub ts_end: u64,
    pub duration_ms: u64,
    /// Measured TCP handshake RTT (ms) when a SYN/SYN-ACK pair was observed
    pub rtt_ms: u64,
    /// First DNS query name observed for this flow
    pub dns_qname: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlowSummaryStats {
    pub active_flows_count: usize,
    pub total_flows_processed: u64,
    pub tcp_flows_count: usize,
    pub udp_flows_count: usize,
    pub other_flows_count: usize,
    pub total_volume_bytes: u64,
    pub persistence_failures: u64,
    pub retry_queue_count: usize,
    /// Average measured TCP handshake RTT over sampled flows (ms, 0 = no data)
    pub avg_rtt_ms: f64,
}

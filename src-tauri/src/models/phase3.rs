use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum CaptureState {
    STOPPED,
    STARTING,
    RUNNING,
    STOPPING,
    ERROR,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NpcapInterface {
    pub id: String,
    pub name: String,
    pub description: String,
    pub ipv4_addresses: Vec<String>,
    pub ipv6_addresses: Vec<String>,
    pub mac_address: String,
    pub is_loopback: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptureEngineDiagnostics {
    pub status: String,
    pub selected_interface: String,
    pub packets_captured: u64,
    pub bytes_captured: u64,
    pub duration_secs: u64,
    pub capture_handle_open: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptureMetrics {
    pub status: String,
    pub selected_interface: String,
    pub packets_captured: u64,
    pub bytes_captured: u64,
    pub packets_per_sec: f64,
    pub bytes_per_sec: f64,
    pub dropped_packets: u64,
    pub duration_secs: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PacketMetadata {
    pub timestamp: String,
    pub captured_len: u32,
    pub orig_len: u32,
    pub eth_type: String,
    pub src_mac: String,
    pub dst_mac: String,
    pub src_ip: String,
    pub dst_ip: String,
    pub protocol: String,
    pub src_port: u16,
    pub dst_port: u16,
    /// TCP flags byte (FIN=0x01 SYN=0x02 RST=0x04 PSH=0x08 ACK=0x10)
    pub tcp_flags: u8,
    /// ARP sender IP (for device discovery from ARP frames)
    pub arp_sender_ip: String,
    pub arp_sender_mac: String,
    /// DNS query name when this packet carries a DNS query/response on port 53
    pub dns_qname: Option<String>,
    pub dns_qtype: String,
    pub dns_rcode: i16,
    pub dns_answers: u16,
}

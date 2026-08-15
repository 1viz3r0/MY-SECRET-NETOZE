use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ja4Observation {
    pub fingerprint: String,
    pub fingerprint_type: String,
    pub flow_id: String,
    pub first_seen: u64,
    pub last_seen: u64,
    pub tls_version: String,
    pub alpn: String,
    pub sni_present: bool,
    pub sni_value: Option<String>,
    pub src_ip: String,
    pub dst_ip: String,
    pub src_port: u16,
    pub dst_port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ja4Stats {
    pub total_fingerprints_count: u64,
    pub unique_ja4_count: usize,
    pub tls13_count: u64,
    pub tls12_count: u64,
    pub sni_present_count: u64,
}

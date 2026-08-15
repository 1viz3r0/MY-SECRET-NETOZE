use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleCondition {
    pub field: String,
    pub operator: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleConditionGroup {
    pub logic: String, // "AND", "OR", "NOT"
    pub conditions: Vec<RuleCondition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectionRule {
    pub rule_id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub severity: String,
    pub confidence: u32,
    pub enabled: bool,
    pub rule_version: String,
    pub condition_group: RuleConditionGroup,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FindingEvidenceDetail {
    pub observation_count: u64,
    pub unique_dst_hosts_count: usize,
    pub unique_dst_ports_count: usize,
    pub time_window_secs: u64,
    pub packet_count: u64,
    pub byte_count: u64,
    pub flow_count: u64,
    pub ja4: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectionFinding {
    pub finding_id: String,
    pub rule_id: String,
    pub rule_version: String,
    pub timestamp: u64,
    pub first_seen: u64,
    pub last_seen: u64,
    pub source_ip: String,
    pub destination_ip: String,
    pub source_port: u16,
    pub destination_port: u16,
    pub protocol: String,
    pub flow_id: String,
    pub ja4: String,
    pub category: String,
    pub severity: String,
    pub confidence: u32,
    pub title: String,
    pub description: String,
    pub evidence: String,
    pub evidence_detail: FindingEvidenceDetail,
    pub status: String, // "ACTIVE", "ACKNOWLEDGED", "RESOLVED"
    pub occurrence_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectionSummary {
    pub total_findings_count: u64,
    pub critical_count: u64,
    pub high_count: u64,
    pub medium_count: u64,
    pub low_count: u64,
    pub info_count: u64,
    pub active_count: u64,
    pub resolved_count: u64,
}

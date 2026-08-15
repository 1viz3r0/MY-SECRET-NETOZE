use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphNode {
    pub node_id: String,
    pub node_type: String, // "HOST", "IP", "FLOW", "PORT", "SERVICE", "JA4", "DETECTION", "TIMELINE_EVENT"
    pub label: String,
    pub properties: String,
    pub first_seen: u64,
    pub last_seen: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphEdge {
    pub edge_id: String,
    pub source_node: String,
    pub destination_node: String,
    pub relationship: String, // "COMMUNICATED_WITH", "CONNECTED_TO", "USED_PORT", "OBSERVED_JA4", "TRIGGERED", "RELATED_TO", "PRECEDED", "CORRELATED_WITH"
    pub first_seen: u64,
    pub last_seen: u64,
    pub confidence: u32,
    pub evidence_ref: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorylineEvent {
    pub event_id: String,
    pub timestamp: u64,
    pub event_type: String,
    pub description: String,
    pub source_entity: String,
    pub target_entity: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttackStoryline {
    pub storyline_id: String,
    pub title: String,
    pub first_seen: u64,
    pub last_seen: u64,
    pub involved_hosts: Vec<String>,
    pub involved_flows: Vec<String>,
    pub involved_findings: Vec<String>,
    pub ja4_observations: Vec<String>,
    pub confidence: u32,
    pub severity: String,
    pub status: String, // "OBSERVED", "CORRELATED", "SUSPICIOUS"
    pub timeline: Vec<StorylineEvent>,
    pub evidence: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttackGraph {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

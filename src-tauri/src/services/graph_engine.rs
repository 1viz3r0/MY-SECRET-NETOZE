use crate::models::{
    AttackGraph, DetectionFinding, FlowRecord, GraphEdge, GraphNode, Ja4Observation,
    SocketProcessCorrelation,
};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

pub struct GraphEngine {
    nodes: Arc<Mutex<HashMap<String, GraphNode>>>,
    edges: Arc<Mutex<HashMap<String, GraphEdge>>>,
}

impl GraphEngine {
    pub fn new() -> Self {
        Self {
            nodes: Arc::new(Mutex::new(HashMap::with_capacity(500))),
            edges: Arc::new(Mutex::new(HashMap::with_capacity(1000))),
        }
    }

    fn current_timestamp() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0)
    }

    pub fn ingest_flow(&self, flow: &FlowRecord) {
        let now_ms = Self::current_timestamp();
        let mut nodes_map = self.nodes.lock().unwrap();
        let mut edges_map = self.edges.lock().unwrap();

        // 1. Host Nodes (Deduplicated)
        let src_node_id = format!("node_host_{}", flow.src_ip.replace('.', "_"));
        let dst_node_id = format!("node_host_{}", flow.dst_ip.replace('.', "_"));

        nodes_map.entry(src_node_id.clone()).or_insert_with(|| GraphNode {
            node_id: src_node_id.clone(),
            node_type: "HOST".to_string(),
            label: format!("Host {}", flow.src_ip),
            properties: format!("{{\"ip\":\"{}\"}}", flow.src_ip),
            first_seen: now_ms,
            last_seen: now_ms,
        });

        nodes_map.entry(dst_node_id.clone()).or_insert_with(|| GraphNode {
            node_id: dst_node_id.clone(),
            node_type: "HOST".to_string(),
            label: format!("Host {}", flow.dst_ip),
            properties: format!("{{\"ip\":\"{}\"}}", flow.dst_ip),
            first_seen: now_ms,
            last_seen: now_ms,
        });

        // 2. Flow Node (Deduplicated)
        let flow_node_id = format!("node_flow_{}", flow.flow_id);
        nodes_map.entry(flow_node_id.clone()).or_insert_with(|| GraphNode {
            node_id: flow_node_id.clone(),
            node_type: "FLOW".to_string(),
            label: format!("{} {}:{}->{}:{}", flow.protocol, flow.src_ip, flow.src_port, flow.dst_ip, flow.dst_port),
            properties: format!("{{\"flow_id\":\"{}\",\"pkts\":{},\"bytes\":{}}}", flow.flow_id, flow.packet_count, flow.total_bytes),
            first_seen: flow.ts_start,
            last_seen: flow.ts_end,
        });

        // 3. Edges: Host -> Flow, Flow -> Target Host
        let edge_src_flow = format!("edge_{}_{}", src_node_id, flow_node_id);
        edges_map.entry(edge_src_flow.clone()).or_insert_with(|| GraphEdge {
            edge_id: edge_src_flow.clone(),
            source_node: src_node_id.clone(),
            destination_node: flow_node_id.clone(),
            relationship: "CONNECTED_TO".to_string(),
            first_seen: now_ms,
            last_seen: now_ms,
            confidence: 95,
            evidence_ref: flow.flow_id.clone(),
        });

        let edge_flow_dst = format!("edge_{}_{}", flow_node_id, dst_node_id);
        edges_map.entry(edge_flow_dst.clone()).or_insert_with(|| GraphEdge {
            edge_id: edge_flow_dst.clone(),
            source_node: flow_node_id.clone(),
            destination_node: dst_node_id.clone(),
            relationship: "COMMUNICATED_WITH".to_string(),
            first_seen: now_ms,
            last_seen: now_ms,
            confidence: 95,
            evidence_ref: flow.flow_id.clone(),
        });

        // Enforce bounded memory
        if nodes_map.len() >= 500 {
            if let Some(k) = nodes_map.keys().next().cloned() {
                nodes_map.remove(&k);
            }
        }
        if edges_map.len() >= 1000 {
            if let Some(k) = edges_map.keys().next().cloned() {
                edges_map.remove(&k);
            }
        }
    }

    pub fn ingest_ja4(&self, ja4: &Ja4Observation) {
        let now_ms = Self::current_timestamp();
        let mut nodes_map = self.nodes.lock().unwrap();
        let mut edges_map = self.edges.lock().unwrap();

        let ja4_node_id = format!("node_ja4_{}", md5_hash(&ja4.fingerprint));
        nodes_map.entry(ja4_node_id.clone()).or_insert_with(|| GraphNode {
            node_id: ja4_node_id.clone(),
            node_type: "JA4".to_string(),
            label: format!("JA4 {}", &ja4.fingerprint[..ja4.fingerprint.len().min(16)]),
            properties: format!("{{\"ja4\":\"{}\",\"ver\":\"{}\"}}", ja4.fingerprint, ja4.tls_version),
            first_seen: ja4.first_seen,
            last_seen: ja4.last_seen,
        });

        if !ja4.flow_id.is_empty() {
            let flow_node_id = format!("node_flow_{}", ja4.flow_id);
            let edge_ja4 = format!("edge_{}_{}", flow_node_id, ja4_node_id);
            edges_map.entry(edge_ja4.clone()).or_insert_with(|| GraphEdge {
                edge_id: edge_ja4.clone(),
                source_node: flow_node_id,
                destination_node: ja4_node_id,
                relationship: "OBSERVED_JA4".to_string(),
                first_seen: now_ms,
                last_seen: now_ms,
                confidence: 90,
                evidence_ref: ja4.flow_id.clone(),
            });
        }
    }

    pub fn ingest_finding(&self, finding: &DetectionFinding) {
        let now_ms = Self::current_timestamp();
        let mut nodes_map = self.nodes.lock().unwrap();
        let mut edges_map = self.edges.lock().unwrap();

        let find_node_id = format!("node_find_{}", finding.finding_id);
        nodes_map.entry(find_node_id.clone()).or_insert_with(|| GraphNode {
            node_id: find_node_id.clone(),
            node_type: "DETECTION".to_string(),
            label: finding.title.clone(),
            properties: format!("{{\"rule_id\":\"{}\",\"sev\":\"{}\",\"conf\":{}}}", finding.rule_id, finding.severity, finding.confidence),
            first_seen: finding.first_seen,
            last_seen: finding.last_seen,
        });

        let src_node_id = format!("node_host_{}", finding.source_ip.replace('.', "_"));
        let edge_trigger = format!("edge_{}_{}", src_node_id, find_node_id);

        edges_map.entry(edge_trigger.clone()).or_insert_with(|| GraphEdge {
            edge_id: edge_trigger.clone(),
            source_node: src_node_id,
            destination_node: find_node_id.clone(),
            relationship: "TRIGGERED".to_string(),
            first_seen: now_ms,
            last_seen: now_ms,
            confidence: finding.confidence,
            evidence_ref: finding.finding_id.clone(),
        });

        if !finding.destination_ip.is_empty() {
            let dst_node_id = format!("node_host_{}", finding.destination_ip.replace('.', "_"));
            let edge_target = format!("edge_{}_{}", find_node_id, dst_node_id);
            edges_map.entry(edge_target.clone()).or_insert_with(|| GraphEdge {
                edge_id: edge_target.clone(),
                source_node: find_node_id,
                destination_node: dst_node_id,
                relationship: "CORRELATED_WITH".to_string(),
                first_seen: now_ms,
                last_seen: now_ms,
                confidence: finding.confidence,
                evidence_ref: finding.finding_id.clone(),
            });
        }
    }

    pub fn ingest_process_correlation(&self, corr: &SocketProcessCorrelation) {
        if corr.pid == 0 || corr.confidence == "UNKNOWN" {
            return;
        }

        let now_ms = Self::current_timestamp();
        let mut nodes_map = self.nodes.lock().unwrap();
        let mut edges_map = self.edges.lock().unwrap();

        let proc_node_id = format!("node_proc_{}", corr.pid);
        nodes_map.entry(proc_node_id.clone()).or_insert_with(|| GraphNode {
            node_id: proc_node_id.clone(),
            node_type: "PROCESS".to_string(),
            label: format!("Process {} (PID {})", corr.process_name, corr.pid),
            properties: format!("{{\"pid\":{},\"name\":\"{}\"}}", corr.pid, corr.process_name),
            first_seen: now_ms,
            last_seen: now_ms,
        });

        let flow_node_id = format!("node_flow_{}", corr.flow_id);
        let edge_proc_flow = format!("edge_{}_{}", proc_node_id, flow_node_id);

        edges_map.entry(edge_proc_flow.clone()).or_insert_with(|| GraphEdge {
            edge_id: edge_proc_flow.clone(),
            source_node: proc_node_id,
            destination_node: flow_node_id,
            relationship: "CORRELATED_WITH".to_string(),
            first_seen: now_ms,
            last_seen: now_ms,
            confidence: if corr.confidence == "HIGH" { 95 } else { 75 },
            evidence_ref: corr.correlation_id.clone(),
        });
    }

    pub fn get_graph(&self) -> AttackGraph {
        let nodes = self.nodes.lock().unwrap().values().cloned().collect();
        let edges = self.edges.lock().unwrap().values().cloned().collect();
        AttackGraph { nodes, edges }
    }
}

fn md5_hash(input: &str) -> u64 {
    let mut hash: u64 = 5381;
    for byte in input.bytes() {
        hash = ((hash << 5).wrapping_add(hash)).wrapping_add(byte as u64);
    }
    hash
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_host_node_deduplication() {
        let engine = GraphEngine::new();
        let flow1 = FlowRecord {
            flow_id: "flw_001".to_string(),
            src_ip: "192.168.1.50".to_string(),
            dst_ip: "10.0.0.1".to_string(),
            src_port: 50000,
            dst_port: 80,
            protocol: "TCP".to_string(),
            ip_version: 4,
            client_bytes: 100,
            server_bytes: 200,
            total_bytes: 300,
            packet_count: 5,
            tcp_state: "ESTABLISHED".to_string(),
            ja4: "".to_string(),
            threat_score: 0,
            severity: "INFO".to_string(),
            ts_start: 1000,
            ts_end: 2000,
            duration_ms: 1000,
            rtt_ms: 0,
            dns_qname: None,
        };

        let flow2 = FlowRecord {
            flow_id: "flw_002".to_string(),
            src_ip: "192.168.1.50".to_string(),
            dst_ip: "10.0.0.1".to_string(),
            src_port: 50001,
            dst_port: 443,
            protocol: "TCP".to_string(),
            ip_version: 4,
            client_bytes: 150,
            server_bytes: 250,
            total_bytes: 400,
            packet_count: 6,
            tcp_state: "ESTABLISHED".to_string(),
            ja4: "".to_string(),
            threat_score: 0,
            severity: "INFO".to_string(),
            ts_start: 1500,
            ts_end: 2500,
            duration_ms: 1000,
            rtt_ms: 0,
            dns_qname: None,
        };

        engine.ingest_flow(&flow1);
        engine.ingest_flow(&flow2);

        let graph = engine.get_graph();
        let host_nodes: Vec<&GraphNode> = graph.nodes.iter().filter(|n| n.node_type == "HOST").collect();
        assert_eq!(host_nodes.len(), 2); // 192.168.1.50 and 10.0.0.1 deduplicated
    }
}

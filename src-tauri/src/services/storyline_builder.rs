use crate::models::{
    AttackStoryline, DetectionFinding, FlowRecord, Ja4Observation, StorylineEvent,
};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

pub struct StorylineBuilder {
    storylines: Arc<Mutex<HashMap<String, AttackStoryline>>>,
}

impl StorylineBuilder {
    pub fn new() -> Self {
        Self {
            storylines: Arc::new(Mutex::new(HashMap::with_capacity(200))),
        }
    }

    fn current_timestamp() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0)
    }

    pub fn build_storyline_from_finding(
        &self,
        finding: &DetectionFinding,
        flows: &[FlowRecord],
        ja4_obs: &[Ja4Observation],
    ) -> AttackStoryline {
        let storyline_id = format!("story_{}", finding.finding_id);
        let now_ms = Self::current_timestamp();

        let mut involved_hosts = vec![finding.source_ip.clone()];
        if !finding.destination_ip.is_empty() {
            involved_hosts.push(finding.destination_ip.clone());
        }

        let mut involved_flows = Vec::new();
        if !finding.flow_id.is_empty() {
            involved_flows.push(finding.flow_id.clone());
        }

        let mut ja4_list = Vec::new();
        if !finding.ja4.is_empty() {
            ja4_list.push(finding.ja4.clone());
        }

        let mut events = Vec::new();

        // 1. Initial Flow Event
        if let Some(matching_flow) = flows.iter().find(|f| f.flow_id == finding.flow_id) {
            events.push(StorylineEvent {
                event_id: format!("evt_flw_{}", matching_flow.flow_id),
                timestamp: matching_flow.ts_start,
                event_type: "FLOW_COMMUNICATION".to_string(),
                description: format!(
                    "Flow {} observed: {}:{} -> {}:{} ({}) with {} packets",
                    matching_flow.flow_id, matching_flow.src_ip, matching_flow.src_port, matching_flow.dst_ip, matching_flow.dst_port, matching_flow.protocol, matching_flow.packet_count
                ),
                source_entity: matching_flow.src_ip.clone(),
                target_entity: matching_flow.dst_ip.clone(),
            });
        }

        // 2. JA4 Event
        if let Some(matching_ja4) = ja4_obs.iter().find(|j| j.flow_id == finding.flow_id || j.src_ip == finding.source_ip) {
            events.push(StorylineEvent {
                event_id: format!("evt_ja4_{}", md5_hash(&matching_ja4.fingerprint)),
                timestamp: matching_ja4.first_seen,
                event_type: "TLS_OBSERVATION".to_string(),
                description: format!(
                    "TLS ClientHello observed with JA4 fingerprint {} (Version: {})",
                    matching_ja4.fingerprint, matching_ja4.tls_version
                ),
                source_entity: matching_ja4.src_ip.clone(),
                target_entity: matching_ja4.dst_ip.clone(),
            });
        }

        // 3. Detection Finding Event
        events.push(StorylineEvent {
            event_id: format!("evt_find_{}", finding.finding_id),
            timestamp: finding.timestamp,
            event_type: "RULE_DETECTION".to_string(),
            description: format!("Rule {} triggered: {}. Evidence: {}", finding.rule_id, finding.title, finding.evidence),
            source_entity: finding.source_ip.clone(),
            target_entity: finding.destination_ip.clone(),
        });

        events.sort_by_key(|e| e.timestamp);

        // Calculate confidence based on evidence richness
        let mut conf = finding.confidence;
        if !ja4_list.is_empty() {
            conf = (conf + 10).min(95);
        }
        if flows.len() > 1 {
            conf = (conf + 5).min(95);
        }

        let status = if finding.severity == "HIGH" || finding.severity == "CRITICAL" {
            "SUSPICIOUS".to_string()
        } else {
            "CORRELATED".to_string()
        };

        let title = match finding.rule_id.as_str() {
            "RULE-001" => format!("Correlated Port Scanning Activity for Host {}", finding.source_ip),
            "RULE-002" => format!("Correlated Host Discovery Activity for Host {}", finding.source_ip),
            "RULE-003" => format!("Correlated Suspicious SMB Session for Host {}", finding.source_ip),
            "RULE-004" => format!("Correlated Suspicious JA4 Fingerprint Sequence for Host {}", finding.source_ip),
            _ => format!("Correlated Activity Sequence for Host {}", finding.source_ip),
        };

        let storyline = AttackStoryline {
            storyline_id: storyline_id.clone(),
            title,
            first_seen: finding.first_seen,
            last_seen: finding.last_seen.max(now_ms),
            involved_hosts,
            involved_flows,
            involved_findings: vec![finding.finding_id.clone()],
            ja4_observations: ja4_list,
            confidence: conf,
            severity: finding.severity.clone(),
            status,
            timeline: events,
            evidence: finding.evidence.clone(),
        };

        let mut map = self.storylines.lock().unwrap();
        if map.len() >= 200 {
            if let Some(k) = map.keys().next().cloned() {
                map.remove(&k);
            }
        }
        map.insert(storyline_id, storyline.clone());

        storyline
    }

    pub fn get_storylines(&self) -> Vec<AttackStoryline> {
        let map = self.storylines.lock().unwrap();
        map.values().cloned().collect()
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
    fn test_storyline_builder_sequence() {
        let builder = StorylineBuilder::new();
        let finding = DetectionFinding {
            finding_id: "find_99".to_string(),
            rule_id: "RULE-001".to_string(),
            rule_version: "1.1.0".to_string(),
            timestamp: 2000,
            first_seen: 1000,
            last_seen: 2000,
            source_ip: "192.168.1.10".to_string(),
            destination_ip: "10.0.0.5".to_string(),
            source_port: 50000,
            destination_port: 80,
            protocol: "TCP".to_string(),
            flow_id: "flw_001".to_string(),
            ja4: "".to_string(),
            category: "RECONNAISSANCE".to_string(),
            severity: "MEDIUM".to_string(),
            confidence: 85,
            title: "Port Scanning Activity Observed".to_string(),
            description: "Scanning observed".to_string(),
            evidence: "192.168.1.10 contacted 20 ports".to_string(),
            evidence_detail: crate::models::phase6::FindingEvidenceDetail {
                observation_count: 1,
                unique_dst_hosts_count: 1,
                unique_dst_ports_count: 20,
                time_window_secs: 30,
                packet_count: 50,
                byte_count: 2500,
                flow_count: 1,
                ja4: None,
            },
            status: "ACTIVE".to_string(),
            occurrence_count: 1,
        };

        let storyline = builder.build_storyline_from_finding(&finding, &[], &[]);
        assert_eq!(storyline.status, "CORRELATED");
        assert_eq!(storyline.confidence, 85);
        assert!(!storyline.timeline.is_empty());
    }
}

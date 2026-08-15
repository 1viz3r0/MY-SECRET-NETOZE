use crate::models::{FlowRecord, RuleCondition, RuleConditionGroup};

pub struct RuleEvaluationContext<'a> {
    pub flow: &'a FlowRecord,
    pub unique_dst_ports: usize,
    pub unique_dst_hosts: usize,
    pub flow_count: u64,
}

pub fn evaluate_condition(cond: &RuleCondition, ctx: &RuleEvaluationContext) -> bool {
    let field_val = match cond.field.as_str() {
        "source_ip" => ctx.flow.src_ip.clone(),
        "destination_ip" => ctx.flow.dst_ip.clone(),
        "source_port" => ctx.flow.src_port.to_string(),
        "destination_port" => ctx.flow.dst_port.to_string(),
        "protocol" => ctx.flow.protocol.clone(),
        "packet_count" => ctx.flow.packet_count.to_string(),
        "byte_count" | "total_bytes" => ctx.flow.total_bytes.to_string(),
        "ja4" => ctx.flow.ja4.clone(),
        "unique_dst_ports" => ctx.unique_dst_ports.to_string(),
        "unique_dst_hosts" => ctx.unique_dst_hosts.to_string(),
        "flow_count" => ctx.flow_count.to_string(),
        _ => "".to_string(),
    };

    match cond.operator.as_str() {
        "EQUALS" => field_val == cond.value,
        "NOT_EQUALS" => field_val != cond.value,
        "CONTAINS" => field_val.contains(&cond.value),
        "GREATER_THAN" => {
            let num_val: u64 = field_val.parse().unwrap_or(0);
            let thresh: u64 = cond.value.parse().unwrap_or(0);
            num_val > thresh
        }
        "LESS_THAN" => {
            let num_val: u64 = field_val.parse().unwrap_or(0);
            let thresh: u64 = cond.value.parse().unwrap_or(0);
            num_val < thresh
        }
        "IN" => {
            let items: Vec<&str> = cond.value.split(',').map(|s| s.trim()).collect();
            items.contains(&field_val.as_str())
        }
        _ => false,
    }
}

pub fn evaluate_group(group: &RuleConditionGroup, ctx: &RuleEvaluationContext) -> bool {
    if group.conditions.is_empty() {
        return false;
    }

    match group.logic.as_str() {
        "AND" => group.conditions.iter().all(|c| evaluate_condition(c, ctx)),
        "OR" => group.conditions.iter().any(|c| evaluate_condition(c, ctx)),
        "NOT" => !group.conditions.iter().any(|c| evaluate_condition(c, ctx)),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_flow() -> FlowRecord {
        FlowRecord {
            flow_id: "flw_123".to_string(),
            src_ip: "192.168.1.50".to_string(),
            dst_ip: "10.0.0.1".to_string(),
            src_port: 54321,
            dst_port: 445,
            protocol: "TCP".to_string(),
            ip_version: 4,
            client_bytes: 1000,
            server_bytes: 5000,
            total_bytes: 6000,
            packet_count: 50,
            tcp_state: "ESTABLISHED".to_string(),
            ja4: "t13d0202h2_a1b2c3d4e5f6_7a8b9c0d1e2f".to_string(),
            threat_score: 0,
            severity: "INFO".to_string(),
            ts_start: 1000,
            ts_end: 2000,
            duration_ms: 1000,
            rtt_ms: 0,
            dns_qname: None,
        }
    }

    #[test]
    fn test_and_condition_evaluation() {
        let flow = sample_flow();
        let ctx = RuleEvaluationContext {
            flow: &flow,
            unique_dst_ports: 20,
            unique_dst_hosts: 1,
            flow_count: 1,
        };

        let group = RuleConditionGroup {
            logic: "AND".to_string(),
            conditions: vec![
                RuleCondition {
                    field: "unique_dst_ports".to_string(),
                    operator: "GREATER_THAN".to_string(),
                    value: "15".to_string(),
                },
                RuleCondition {
                    field: "protocol".to_string(),
                    operator: "EQUALS".to_string(),
                    value: "TCP".to_string(),
                },
            ],
        };

        assert!(evaluate_group(&group, &ctx));
    }
}

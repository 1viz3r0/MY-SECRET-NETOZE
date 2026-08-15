use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EduExplanation {
    pub field_id: String,
    pub title: String,
    pub category: String,
    pub short_description: String,
    pub detailed_explanation: String,
    pub current_value: String,
    pub interpretation: String,
    pub status_level: String, // "OBSERVED", "CORRELATED", "SUSPICIOUS"
    pub evidence: Vec<String>,
    pub related_entities: Vec<String>,
    pub analyst_next_steps: Vec<String>,
}

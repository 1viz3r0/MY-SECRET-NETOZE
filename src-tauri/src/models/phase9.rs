use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryValidationResult {
    pub is_valid: bool,
    pub is_read_only: bool,
    pub statement_type: String,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForensicColumnMeta {
    pub name: String,
    pub data_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForensicTableSchema {
    pub table_name: String,
    pub description: String,
    pub columns: Vec<ForensicColumnMeta>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForensicTemplate {
    pub template_id: String,
    pub title: String,
    pub description: String,
    pub category: String,
    pub sql: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForensicQueryResult {
    pub execution_time_ms: u64,
    pub row_count: usize,
    pub columns: Vec<String>,
    pub rows: Vec<Vec<String>>,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedForensicQuery {
    pub query_id: String,
    pub name: String,
    pub description: String,
    pub sql: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForensicAuditEntry {
    pub audit_id: String,
    pub timestamp: String,
    pub query_text: String,
    pub execution_time_ms: u64,
    pub row_count: usize,
    pub status: String,
    pub error_message: Option<String>,
}

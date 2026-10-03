pub mod phase10;
pub mod phase11;
pub mod phase2;
pub mod phase3;
pub mod phase4;
pub mod phase5;
pub mod phase6;
pub mod phase7;
pub mod phase8;
pub mod phase9;

pub use phase10::{
    HostIdentity, NetworkInterfaceEntry, ProcessEntry, SocketProcessCorrelation, SystemSnapshot,
    TcpSocketEntry, WindowsServiceEntry,
};
pub use phase11::{
    ConnectivityStatus, DeviceEntry, DnsQueryEntry, GeoIpEntry, LocalSubnet, PortScanEntry,
    ThreatIntelStatus, ThreatMatchEntry,
};
pub use phase2::{
    DetailedAdapterInfo, DetailedSystemInfo, TcpConnectionEntry, TelemetryPayload,
    WindowsEventEntry,
};
pub use phase3::{
    CaptureEngineDiagnostics, CaptureMetrics, CaptureState, NpcapInterface, PacketMetadata,
};
pub use phase4::{FlowRecord, FlowSummaryStats};
pub use phase5::{Ja4Observation, Ja4Stats};
pub use phase6::{
    DetectionFinding, DetectionRule, DetectionSummary, FindingEvidenceDetail, RuleCondition,
    RuleConditionGroup,
};
pub use phase7::{AttackGraph, AttackStoryline, GraphEdge, GraphNode, StorylineEvent};
pub use phase8::EduExplanation;
pub use phase9::{
    ForensicAuditEntry, ForensicColumnMeta, ForensicQueryResult, ForensicTableSchema,
    ForensicTemplate, QueryValidationResult, SavedForensicQuery,
};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NpcapStatus {
    pub installed: bool,
    pub service_available: bool,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PacketCaptureCapability {
    pub available: bool,
    pub driver: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CapabilityStatus {
    pub administrator: bool,
    pub npcap: NpcapStatus,
    pub packet_capture: PacketCaptureCapability,
    pub raw_sockets: bool,
    pub interfaces_count: usize,
    pub platform: String,
    pub active_tcp_available: bool,
    pub windows_event_log_available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkAdapterInfo {
    pub name: String,
    pub description: String,
    pub ip_addresses: Vec<String>,
    pub mac_address: String,
    pub is_up: bool,
    pub is_loopback: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemInfo {
    pub os_name: String,
    pub os_version: String,
    pub hostname: String,
    pub architecture: String,
    pub user_name: String,
    pub is_admin: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub selected_interface: String,
    pub capture_status: String,
    pub app_mode: String,
    pub theme: String,
    pub sqlite_path: String,
    pub duckdb_path: String,
}

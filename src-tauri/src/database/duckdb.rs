use crate::models::{
    AttackGraph, AttackStoryline, DetectionFinding, FlowRecord, Ja4Observation,
};
use std::fs;
use std::path::PathBuf;

/// Resolves path for DuckDB flow telemetry file `netoze_flows.duckdb`
pub fn init_duckdb() -> Result<PathBuf, String> {
    let mut db_path = crate::database::sqlite::get_app_dir();
    db_path.push("netoze_flows.duckdb");

    if !db_path.exists() {
        let _ = fs::File::create(&db_path);
    }

    tracing::info!("✅ DuckDB Flow Telemetry database initialized at {:?}", db_path);
    Ok(db_path)
}

/// Persists flow records to local database file safely with explicit error logging and idempotency
pub fn persist_flow_records(records: &[FlowRecord]) -> Result<usize, String> {
    if records.is_empty() {
        return Ok(0);
    }

    let db_path = crate::database::sqlite::get_app_dir().join("netoze_app.db");
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| {
        tracing::error!("❌ Database connection failed at {:?}: {}", db_path, e);
        e.to_string()
    })?;

    // Create table with Primary Key (flow_id) for idempotency
    conn.execute(
        "CREATE TABLE IF NOT EXISTS flow_records (
            flow_id TEXT PRIMARY KEY,
            src_ip TEXT NOT NULL,
            dst_ip TEXT NOT NULL,
            src_port INTEGER NOT NULL,
            dst_port INTEGER NOT NULL,
            protocol TEXT NOT NULL,
            ip_version INTEGER NOT NULL,
            client_bytes INTEGER NOT NULL,
            server_bytes INTEGER NOT NULL,
            total_bytes INTEGER NOT NULL,
            packet_count INTEGER NOT NULL,
            tcp_state TEXT NOT NULL,
            ja4 TEXT,
            threat_score INTEGER NOT NULL,
            severity TEXT NOT NULL,
            ts_start INTEGER NOT NULL,
            ts_end INTEGER NOT NULL,
            duration_ms INTEGER NOT NULL,
            rtt_ms INTEGER DEFAULT 0,
            dns_qname TEXT
        )",
        [],
    )
    .map_err(|e| {
        tracing::error!("❌ Failed to create flow_records table: {}", e);
        e.to_string()
    })?;

    // Migration for existing DBs created before rtt_ms / dns_qname
    for (col, decl) in [("rtt_ms", "INTEGER DEFAULT 0"), ("dns_qname", "TEXT")] {
        let has = conn
            .query_row(
                &format!(
                    "SELECT COUNT(*) FROM pragma_table_info('flow_records') WHERE name = '{}'",
                    col
                ),
                [],
                |r| r.get::<_, i64>(0),
            )
            .unwrap_or(0);
        if has == 0 {
            let _ = conn.execute(
                &format!("ALTER TABLE flow_records ADD COLUMN {} {}", col, decl),
                [],
            );
        }
    }

    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_flow_records_ts ON flow_records(ts_start)",
        [],
    );
    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_flow_records_src_ip ON flow_records(src_ip)",
        [],
    );
    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_flow_records_dst_ip ON flow_records(dst_ip)",
        [],
    );
    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_flow_records_proto ON flow_records(protocol)",
        [],
    );

    let mut inserted = 0;
    let mut errors = 0;

    for f in records {
        let res = conn.execute(
            "INSERT OR REPLACE INTO flow_records (
                flow_id, src_ip, dst_ip, src_port, dst_port, protocol, ip_version,
                client_bytes, server_bytes, total_bytes, packet_count, tcp_state,
                ja4, threat_score, severity, ts_start, ts_end, duration_ms,
                rtt_ms, dns_qname
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)",
            rusqlite::params![
                f.flow_id,
                f.src_ip,
                f.dst_ip,
                f.src_port,
                f.dst_port,
                f.protocol,
                f.ip_version,
                f.client_bytes,
                f.server_bytes,
                f.total_bytes,
                f.packet_count,
                f.tcp_state,
                f.ja4,
                f.threat_score,
                f.severity,
                f.ts_start,
                f.ts_end,
                f.duration_ms,
                f.rtt_ms,
                f.dns_qname,
            ],
        );

        match res {
            Ok(_) => inserted += 1,
            Err(e) => {
                tracing::error!("❌ Flow persistence error for flow_id {}: {}", f.flow_id, e);
                errors += 1;
            }
        }
    }

    if errors > 0 && inserted == 0 {
        Err(format!("Failed to persist {} flow records to database", errors))
    } else {
        Ok(inserted)
    }
}

/// Persists JA4 observations to local database file safely
pub fn persist_ja4_observations(observations: &[Ja4Observation]) -> Result<usize, String> {
    if observations.is_empty() {
        return Ok(0);
    }

    let db_path = crate::database::sqlite::get_app_dir().join("netoze_app.db");
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS ja4_fingerprints (
            fingerprint TEXT PRIMARY KEY,
            fingerprint_type TEXT NOT NULL,
            flow_id TEXT NOT NULL,
            tls_version TEXT NOT NULL,
            alpn TEXT NOT NULL,
            sni_present INTEGER NOT NULL,
            sni_value TEXT,
            src_ip TEXT NOT NULL,
            dst_ip TEXT NOT NULL,
            src_port INTEGER NOT NULL,
            dst_port INTEGER NOT NULL,
            first_seen INTEGER NOT NULL,
            last_seen INTEGER NOT NULL
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_ja4_fingerprint ON ja4_fingerprints(fingerprint)",
        [],
    );
    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_ja4_ts ON ja4_fingerprints(first_seen)",
        [],
    );
    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_ja4_src_ip ON ja4_fingerprints(src_ip)",
        [],
    );

    let mut inserted = 0;
    for o in observations {
        let sni_flag = if o.sni_present { 1 } else { 0 };
        let res = conn.execute(
            "INSERT OR REPLACE INTO ja4_fingerprints (
                fingerprint, fingerprint_type, flow_id, tls_version, alpn,
                sni_present, sni_value, src_ip, dst_ip, src_port, dst_port,
                first_seen, last_seen
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            rusqlite::params![
                o.fingerprint,
                o.fingerprint_type,
                o.flow_id,
                o.tls_version,
                o.alpn,
                sni_flag,
                o.sni_value,
                o.src_ip,
                o.dst_ip,
                o.src_port,
                o.dst_port,
                o.first_seen,
                o.last_seen,
            ],
        );
        if res.is_ok() {
            inserted += 1;
        }
    }

    Ok(inserted)
}

/// Persists detection findings to local database file safely
pub fn persist_detection_findings(findings: &[DetectionFinding]) -> Result<usize, String> {
    if findings.is_empty() {
        return Ok(0);
    }

    let db_path = crate::database::sqlite::get_app_dir().join("netoze_app.db");
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS detection_findings (
            finding_id TEXT PRIMARY KEY,
            rule_id TEXT NOT NULL,
            rule_version TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            first_seen INTEGER NOT NULL,
            last_seen INTEGER NOT NULL,
            source_ip TEXT NOT NULL,
            destination_ip TEXT NOT NULL,
            source_port INTEGER NOT NULL,
            destination_port INTEGER NOT NULL,
            protocol TEXT NOT NULL,
            flow_id TEXT NOT NULL,
            ja4 TEXT,
            category TEXT NOT NULL,
            severity TEXT NOT NULL,
            confidence INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            evidence TEXT NOT NULL,
            status TEXT NOT NULL,
            occurrence_count INTEGER NOT NULL
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_finding_id ON detection_findings(finding_id)",
        [],
    );
    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_finding_ts ON detection_findings(timestamp)",
        [],
    );
    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_finding_sev ON detection_findings(severity)",
        [],
    );

    let mut inserted = 0;
    for f in findings {
        let res = conn.execute(
            "INSERT OR REPLACE INTO detection_findings (
                finding_id, rule_id, rule_version, timestamp, first_seen, last_seen,
                source_ip, destination_ip, source_port, destination_port, protocol,
                flow_id, ja4, category, severity, confidence, title, description,
                evidence, status, occurrence_count
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)",
            rusqlite::params![
                f.finding_id,
                f.rule_id,
                f.rule_version,
                f.timestamp,
                f.first_seen,
                f.last_seen,
                f.source_ip,
                f.destination_ip,
                f.source_port,
                f.destination_port,
                f.protocol,
                f.flow_id,
                f.ja4,
                f.category,
                f.severity,
                f.confidence,
                f.title,
                f.description,
                f.evidence,
                f.status,
                f.occurrence_count,
            ],
        );
        if res.is_ok() {
            inserted += 1;
        }
    }

    Ok(inserted)
}

/// Persists Attack Graph & Storylines to local database file safely
pub fn persist_attack_graph_and_storylines(
    graph: &AttackGraph,
    storylines: &[AttackStoryline],
) -> Result<usize, String> {
    let db_path = crate::database::sqlite::get_app_dir().join("netoze_app.db");
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS graph_nodes (
            node_id TEXT PRIMARY KEY,
            node_type TEXT NOT NULL,
            label TEXT NOT NULL,
            properties TEXT NOT NULL,
            first_seen INTEGER NOT NULL,
            last_seen INTEGER NOT NULL
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS graph_edges (
            edge_id TEXT PRIMARY KEY,
            source_node TEXT NOT NULL,
            destination_node TEXT NOT NULL,
            relationship TEXT NOT NULL,
            first_seen INTEGER NOT NULL,
            last_seen INTEGER NOT NULL,
            confidence INTEGER NOT NULL,
            evidence_ref TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS storylines (
            storyline_id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            first_seen INTEGER NOT NULL,
            last_seen INTEGER NOT NULL,
            confidence INTEGER NOT NULL,
            severity TEXT NOT NULL,
            status TEXT NOT NULL,
            evidence TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS storyline_events (
            event_id TEXT PRIMARY KEY,
            storyline_id TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            event_type TEXT NOT NULL,
            description TEXT NOT NULL,
            source_entity TEXT NOT NULL,
            target_entity TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_node_type ON graph_nodes(node_type)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_edge_src ON graph_edges(source_node)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_edge_dst ON graph_edges(destination_node)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_storyline_ts ON storylines(first_seen)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_storyline_events_id ON storyline_events(storyline_id)", []);

    let mut count = 0;

    for n in &graph.nodes {
        let res = conn.execute(
            "INSERT OR REPLACE INTO graph_nodes (node_id, node_type, label, properties, first_seen, last_seen)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![n.node_id, n.node_type, n.label, n.properties, n.first_seen, n.last_seen],
        );
        if res.is_ok() { count += 1; }
    }

    for e in &graph.edges {
        let res = conn.execute(
            "INSERT OR REPLACE INTO graph_edges (edge_id, source_node, destination_node, relationship, first_seen, last_seen, confidence, evidence_ref)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![e.edge_id, e.source_node, e.destination_node, e.relationship, e.first_seen, e.last_seen, e.confidence, e.evidence_ref],
        );
        if res.is_ok() { count += 1; }
    }

    for s in storylines {
        let res = conn.execute(
            "INSERT OR REPLACE INTO storylines (storyline_id, title, first_seen, last_seen, confidence, severity, status, evidence)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![s.storyline_id, s.title, s.first_seen, s.last_seen, s.confidence, s.severity, s.status, s.evidence],
        );
        if res.is_ok() { count += 1; }

        for ev in &s.timeline {
            let res = conn.execute(
                "INSERT OR REPLACE INTO storyline_events (event_id, storyline_id, timestamp, event_type, description, source_entity, target_entity)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                rusqlite::params![ev.event_id, s.storyline_id, ev.timestamp, ev.event_type, ev.description, ev.source_entity, ev.target_entity],
            );
            if res.is_ok() { count += 1; }
        }
    }

    Ok(count)
}

use crate::models::TelemetryPayload;
use crate::platform::{get_active_tcp_connections, get_detailed_network_adapters};
use crate::services::FlowEngine;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::Emitter;

pub fn start_telemetry_worker(app_handle: tauri::AppHandle, flow_engine: Arc<Mutex<FlowEngine>>) {
    tauri::async_runtime::spawn(async move {
        let prev_rx = Arc::new(AtomicU64::new(0));
        let prev_tx = Arc::new(AtomicU64::new(0));

        loop {
            tokio::time::sleep(Duration::from_millis(1500)).await;

            let adapters = get_detailed_network_adapters();
            let (curr_rx, curr_tx, curr_rx_pkts, curr_tx_pkts) = adapters.iter().fold(
                (0u64, 0u64, 0u64, 0u64),
                |(rx_acc, tx_acc, rxp_acc, txp_acc), ad| {
                    (
                        rx_acc + ad.rx_bytes,
                        tx_acc + ad.tx_bytes,
                        rxp_acc + ad.rx_packets,
                        txp_acc + ad.tx_packets,
                    )
                },
            );

            let old_rx = prev_rx.swap(curr_rx, Ordering::Relaxed);
            let old_tx = prev_tx.swap(curr_tx, Ordering::Relaxed);

            let rx_delta_bytes = if old_rx > 0 && curr_rx >= old_rx {
                curr_rx - old_rx
            } else {
                0
            };
            let tx_delta_bytes = if old_tx > 0 && curr_tx >= old_tx {
                curr_tx - old_tx
            } else {
                0
            };

            let rx_kbps = (rx_delta_bytes as f64 / 1024.0) / 1.5;
            let tx_kbps = (tx_delta_bytes as f64 / 1024.0) / 1.5;

            let tcp_conns = get_active_tcp_connections();
            let timestamp = chrono::Utc::now().to_rfc3339();

            // Real RTT measured from observed TCP handshakes (0.0 = no samples yet)
            let avg_rtt_ms = flow_engine
                .lock()
                .map(|fe| fe.get_summary_stats().avg_rtt_ms)
                .unwrap_or(0.0);

            let payload = TelemetryPayload {
                rx_kbps,
                tx_kbps,
                rx_packets_delta: curr_rx_pkts,
                tx_packets_delta: curr_tx_pkts,
                rtt_avg_ms: avg_rtt_ms,
                active_tcp_count: tcp_conns.len(),
                timestamp,
            };

            let _ = app_handle.emit("system-telemetry", payload);
        }
    });
}

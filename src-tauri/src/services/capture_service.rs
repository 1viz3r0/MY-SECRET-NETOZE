use crate::models::{CaptureMetrics, CaptureState, NpcapInterface, PacketMetadata};
use crate::platform::windows::inspect_npcap;
use crate::services::NpcapCapture;
use crate::services::StorylineBuilder;
use crate::services::detection_engine::DetectionEngine;
use crate::services::flow_engine::FlowEngine;
use crate::services::graph_engine::GraphEngine;
use crate::services::ja4_engine::Ja4Engine;
use pcap::Device;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

pub struct CaptureEngine {
    state: Arc<Mutex<CaptureState>>,
    capture: Arc<NpcapCapture>,
}

impl CaptureEngine {
    pub fn new(
        flow_engine: Arc<Mutex<FlowEngine>>,
        ja4_engine: Arc<Mutex<Ja4Engine>>,
        detection_engine: Arc<Mutex<DetectionEngine>>,
        graph_engine: Arc<Mutex<GraphEngine>>,
        storyline_builder: Arc<Mutex<StorylineBuilder>>,
    ) -> Self {
        Self {
            state: Arc::new(Mutex::new(CaptureState::STOPPED)),
            capture: Arc::new(NpcapCapture::new(
                flow_engine,
                ja4_engine,
                detection_engine,
                graph_engine,
                storyline_builder,
            )),
        }
    }

    pub fn inspect_availability(&self) -> (String, String) {
        let npcap = inspect_npcap();
        if npcap.installed {
            (
                "AVAILABLE".to_string(),
                "Npcap Packet Capture Engine is installed and ready.".to_string(),
            )
        } else {
            (
                "UNAVAILABLE".to_string(),
                "Npcap is not installed or unavailable. Packet capture features are paused. Please install Npcap.".to_string(),
            )
        }
    }

    pub fn get_interfaces(&self) -> Vec<NpcapInterface> {
        match Device::list() {
            Ok(devices) => devices
                .into_iter()
                .map(|dev| {
                    let description = dev
                        .desc
                        .clone()
                        .unwrap_or_else(|| dev.name.clone());
                    let is_loopback = dev.name.to_lowercase().contains("loopback")
                        || description.to_lowercase().contains("loopback");
                    NpcapInterface {
                        id: dev.name.clone(),
                        name: description.clone(),
                        description,
                        ipv4_addresses: Vec::new(),
                        ipv6_addresses: Vec::new(),
                        mac_address: String::new(),
                        is_loopback,
                    }
                })
                .collect(),
            Err(_) => Vec::new(),
        }
    }

    pub fn get_state(&self) -> CaptureState {
        self.state.lock().unwrap().clone()
    }

    pub fn active_interface(&self) -> Option<String> {
        self.capture.active_iface.lock().unwrap().clone()
    }

    pub fn start_capture(&self, interface_id: String, app_handle: AppHandle) -> Result<(), String> {
        let (avail, msg) = self.inspect_availability();
        if avail != "AVAILABLE" {
            return Err(msg);
        }

        {
            let mut st = self.state.lock().unwrap();
            if *st == CaptureState::RUNNING {
                return Ok(());
            }
            *st = CaptureState::STARTING;
        }

        if let Err(err) = self.capture.open_interface(&interface_id) {
            let mut st = self.state.lock().unwrap();
            *st = CaptureState::ERROR;
            return Err(format!("Failed to open capture interface: {}", err));
        }

        {
            let mut st = self.state.lock().unwrap();
            *st = CaptureState::RUNNING;
        }

        let _ = app_handle.emit("capture-status", "RUNNING");
        self.capture.run_capture_loop(app_handle);
        Ok(())
    }

    pub fn stop_capture(&self, app_handle: AppHandle) {
        {
            let mut st = self.state.lock().unwrap();
            if *st != CaptureState::RUNNING {
                return;
            }
            *st = CaptureState::STOPPING;
        }

        self.capture.close();

        {
            let mut st = self.state.lock().unwrap();
            *st = CaptureState::STOPPED;
        }

        let _ = app_handle.emit("capture-status", "STOPPED");
    }

    pub fn get_metrics(&self) -> CaptureMetrics {
        let st = self.get_state();
        self.capture.get_metrics(&format!("{:?}", st))
    }

    pub fn get_recent_packets(&self, limit: usize) -> Vec<PacketMetadata> {
        self.capture.get_recent_packets(limit)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::StorylineBuilder;

    #[test]
    fn test_capture_engine_initialization() {
        let flow_engine = Arc::new(Mutex::new(FlowEngine::new()));
        let ja4_engine = Arc::new(Mutex::new(Ja4Engine::new()));
        let detection_engine = Arc::new(Mutex::new(DetectionEngine::new()));
        let graph_engine = Arc::new(Mutex::new(GraphEngine::new()));
        let storyline_builder = Arc::new(Mutex::new(StorylineBuilder::new()));

        let engine = CaptureEngine::new(
            flow_engine,
            ja4_engine,
            detection_engine,
            graph_engine,
            storyline_builder,
        );

        assert_eq!(engine.get_state(), CaptureState::STOPPED);
        let metrics = engine.get_metrics();
        assert_eq!(metrics.packets_captured, 0);
        assert_eq!(metrics.bytes_captured, 0);
    }
}

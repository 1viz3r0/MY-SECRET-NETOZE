use crate::models::{Ja4Observation, Ja4Stats, PacketMetadata};
use crate::services::ja4_canonicalizer::{canonicalize_ja4, RawTlsClientHello};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

pub struct Ja4Engine {
    observations: Arc<Mutex<HashMap<String, Ja4Observation>>>,
    total_count: Arc<AtomicU64>,
    tls13_count: Arc<AtomicU64>,
    tls12_count: Arc<AtomicU64>,
    sni_count: Arc<AtomicU64>,
}

impl Ja4Engine {
    pub fn new() -> Self {
        Self {
            observations: Arc::new(Mutex::new(HashMap::with_capacity(500))),
            total_count: Arc::new(AtomicU64::new(0)),
            tls13_count: Arc::new(AtomicU64::new(0)),
            tls12_count: Arc::new(AtomicU64::new(0)),
            sni_count: Arc::new(AtomicU64::new(0)),
        }
    }

    /// Safely parses raw TLS record payload and attempts to extract ClientHello
    pub fn parse_client_hello(payload: &[u8]) -> Option<RawTlsClientHello> {
        if payload.len() < 43 {
            return None;
        }

        // TLS Record Layer Header
        // Byte 0: ContentType (0x16 Handshake)
        // Bytes 1-2: Version
        // Bytes 3-4: Length
        if payload[0] != 0x16 {
            return None;
        }

        let record_len = u16::from_be_bytes([payload[3], payload[4]]) as usize;
        if payload.len() < 5 + record_len || record_len < 38 {
            return None;
        }

        let hs = &payload[5..5 + record_len];

        // Handshake Header
        // Byte 0: HandshakeType (0x01 ClientHello)
        // Bytes 1-3: Handshake Length
        if hs[0] != 0x01 {
            return None;
        }

        let hs_len = ((hs[1] as usize) << 16) | ((hs[2] as usize) << 8) | (hs[3] as usize);
        if hs.len() < 4 + hs_len || hs_len < 34 {
            return None;
        }

        let ch = &hs[4..4 + hs_len];
        let tls_version_raw = u16::from_be_bytes([ch[0], ch[1]]);

        // Skip Random (32 bytes)
        let mut idx = 34;

        // Session ID
        if idx >= ch.len() {
            return None;
        }
        let sess_id_len = ch[idx] as usize;
        idx += 1 + sess_id_len;

        // Cipher Suites
        if idx + 2 > ch.len() {
            return None;
        }
        let cipher_len = u16::from_be_bytes([ch[idx], ch[idx + 1]]) as usize;
        idx += 2;

        if idx + cipher_len > ch.len() {
            return None;
        }

        let mut cipher_suites = Vec::new();
        for chunk in ch[idx..idx + cipher_len].chunks_exact(2) {
            cipher_suites.push(u16::from_be_bytes([chunk[0], chunk[1]]));
        }
        idx += cipher_len;

        // Compression Methods
        if idx >= ch.len() {
            return None;
        }
        let comp_len = ch[idx] as usize;
        idx += 1 + comp_len;

        // Extensions
        let mut extensions = Vec::new();
        let mut supported_groups = Vec::new();
        let mut supported_version = None;
        let mut alpn = None;
        let mut sni = None;

        if idx + 2 <= ch.len() {
            let ext_len = u16::from_be_bytes([ch[idx], ch[idx + 1]]) as usize;
            idx += 2;

            let ext_end = (idx + ext_len).min(ch.len());

            while idx + 4 <= ext_end {
                let ext_type = u16::from_be_bytes([ch[idx], ch[idx + 1]]);
                let ext_data_len = u16::from_be_bytes([ch[idx + 2], ch[idx + 3]]) as usize;
                idx += 4;

                if idx + ext_data_len > ext_end {
                    break;
                }

                let ext_data = &ch[idx..idx + ext_data_len];
                extensions.push(ext_type);

                match ext_type {
                    0x0000 => {
                        // SNI (Server Name Indication)
                        if ext_data.len() >= 5 {
                            let name_len = u16::from_be_bytes([ext_data[3], ext_data[4]]) as usize;
                            if ext_data.len() >= 5 + name_len {
                                if let Ok(s) = std::str::from_utf8(&ext_data[5..5 + name_len]) {
                                    sni = Some(s.to_string());
                                }
                            }
                        }
                    }
                    0x000a => {
                        // Supported Groups
                        if ext_data.len() >= 2 {
                            let grp_len = u16::from_be_bytes([ext_data[0], ext_data[1]]) as usize;
                            if ext_data.len() >= 2 + grp_len {
                                for chunk in ext_data[2..2 + grp_len].chunks_exact(2) {
                                    supported_groups.push(u16::from_be_bytes([chunk[0], chunk[1]]));
                                }
                            }
                        }
                    }
                    0x0010 => {
                        // ALPN
                        if ext_data.len() >= 3 {
                            let proto_len = ext_data[2] as usize;
                            if ext_data.len() >= 3 + proto_len {
                                if let Ok(a) = std::str::from_utf8(&ext_data[3..3 + proto_len]) {
                                    alpn = Some(a.to_string());
                                }
                            }
                        }
                    }
                    0x002b => {
                        // Supported Versions (TLS 1.3)
                        if ext_data.len() >= 1 {
                            let vers_len = ext_data[0] as usize;
                            if ext_data.len() >= 1 + vers_len {
                                for chunk in ext_data[1..1 + vers_len].chunks_exact(2) {
                                    let v = u16::from_be_bytes([chunk[0], chunk[1]]);
                                    if v == 0x0304 {
                                        supported_version = Some(0x0304);
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    _ => {}
                }

                idx += ext_data_len;
            }
        }

        Some(RawTlsClientHello {
            is_quic: false,
            tls_version_raw,
            supported_version,
            cipher_suites,
            extensions,
            supported_groups,
            alpn,
            sni,
        })
    }

    /// Ingests packet and extracts JA4 observation if TLS ClientHello is present
    pub fn process_packet(&self, packet: &PacketMetadata, raw_payload: &[u8], flow_id: &str) -> Option<Ja4Observation> {
        let hello = Self::parse_client_hello(raw_payload)?;
        let fingerprint = canonicalize_ja4(&hello);

        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let ver_str = if hello.supported_version == Some(0x0304) {
            self.tls13_count.fetch_add(1, Ordering::Relaxed);
            "TLS 1.3".to_string()
        } else {
            self.tls12_count.fetch_add(1, Ordering::Relaxed);
            "TLS 1.2".to_string()
        };

        if hello.sni.is_some() {
            self.sni_count.fetch_add(1, Ordering::Relaxed);
        }

        self.total_count.fetch_add(1, Ordering::Relaxed);

        let obs = Ja4Observation {
            fingerprint: fingerprint.clone(),
            fingerprint_type: "JA4_TLS_CLIENT".to_string(),
            flow_id: flow_id.to_string(),
            first_seen: now_ms,
            last_seen: now_ms,
            tls_version: ver_str,
            alpn: hello.alpn.unwrap_or_else(|| "00".to_string()),
            sni_present: hello.sni.is_some(),
            sni_value: hello.sni,
            src_ip: packet.src_ip.clone(),
            dst_ip: packet.dst_ip.clone(),
            src_port: packet.src_port,
            dst_port: packet.dst_port,
        };

        let mut queue = self.observations.lock().unwrap();
        if queue.len() >= 500 {
            if let Some(k) = queue.keys().next().cloned() {
                queue.remove(&k);
            }
        }
        queue.insert(fingerprint.clone(), obs.clone());

        Some(obs)
    }

    pub fn get_observations(&self, limit: usize) -> Vec<Ja4Observation> {
        let queue = self.observations.lock().unwrap();
        let limit = limit.min(500);
        queue.values().take(limit).cloned().collect()
    }

    pub fn get_stats(&self) -> Ja4Stats {
        let queue = self.observations.lock().unwrap();
        Ja4Stats {
            total_fingerprints_count: self.total_count.load(Ordering::Relaxed),
            unique_ja4_count: queue.len(),
            tls13_count: self.tls13_count.load(Ordering::Relaxed),
            tls12_count: self.tls12_count.load(Ordering::Relaxed),
            sni_present_count: self.sni_count.load(Ordering::Relaxed),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_non_tls_packet_returns_none() {
        let raw_http = b"GET / HTTP/1.1\r\nHost: example.com\r\n\r\n";
        assert!(Ja4Engine::parse_client_hello(raw_http).is_none());
    }
}

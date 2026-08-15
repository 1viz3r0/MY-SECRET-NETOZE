import { isTauriEnvironment } from './isTauri';

export interface Ja4Observation {
  fingerprint: string;
  fingerprint_type: string;
  flow_id: string;
  first_seen: number;
  last_seen: number;
  tls_version: string;
  alpn: string;
  sni_present: boolean;
  sni_value?: string;
  src_ip: string;
  dst_ip: string;
  src_port: number;
  dst_port: number;
}

export interface Ja4Stats {
  total_fingerprints_count: number;
  unique_ja4_count: number;
  tls13_count: number;
  tls12_count: number;
  sni_present_count: number;
}

/**
 * Gets recent JA4 fingerprint observations
 */
export async function getJa4Observations(limit = 100): Promise<Ja4Observation[]> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Ja4Observation[]>('get_ja4_observations', { limit });
    } catch (err) {
      console.warn('Failed to get JA4 observations:', err);
    }
  }
  return [];
}

/**
 * Gets JA4 stats
 */
export async function getJa4Stats(): Promise<Ja4Stats> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Ja4Stats>('get_ja4_stats');
    } catch (err) {
      console.warn('Failed to get JA4 stats:', err);
    }
  }
  return {
    total_fingerprints_count: 0,
    unique_ja4_count: 0,
    tls13_count: 0,
    tls12_count: 0,
    sni_present_count: 0,
  };
}

/**
 * Look up specific JA4 fingerprint
 */
export async function lookupJa4(fingerprint: string): Promise<Ja4Observation | null> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<Ja4Observation | null>('lookup_ja4', { fingerprint });
    } catch (err) {
      console.warn('Failed to lookup JA4 fingerprint:', err);
    }
  }
  return null;
}

/**
 * Subscribes to ja4-stream events (real JA4 observations from the native engine)
 */
export async function subscribeToJa4Stream(
  callback: (obs: Ja4Observation) => void
): Promise<() => void> {
  if (isTauriEnvironment()) {
    try {
      const { listen } = await import('@tauri-apps/api/event');
      return await listen<Ja4Observation>('ja4-stream', (e) => callback(e.payload));
    } catch (err) {
      console.warn('Failed to listen to ja4.stream:', err);
    }
  }
  return () => {};
}

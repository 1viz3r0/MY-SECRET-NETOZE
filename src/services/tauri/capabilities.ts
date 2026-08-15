import { isTauriEnvironment } from './isTauri';

export interface NpcapStatus {
  installed: boolean;
  service_available: boolean;
  version?: string;
}

export interface PacketCaptureCapability {
  available: boolean;
  driver: string;
  reason: string;
}

export interface CapabilityStatus {
  administrator: boolean;
  npcap: NpcapStatus;
  packet_capture: PacketCaptureCapability;
  raw_sockets: boolean;
  interfaces_count: number;
  platform: string;
}

/**
 * Invokes native get_capability_status command or returns web dev mode status
 */
export async function getCapabilityStatus(): Promise<CapabilityStatus> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<CapabilityStatus>('get_capability_status');
    } catch (err) {
      console.warn('Failed to invoke native get_capability_status:', err);
    }
  }

  // Web Browser Fallback (NO FAKE TELEMETRY: clearly indicates browser web dev mode)
  return {
    administrator: false,
    npcap: {
      installed: false,
      service_available: false,
    },
    packet_capture: {
      available: false,
      driver: 'Browser Sandbox (None)',
      reason: 'Desktop capability unavailable in browser mode. Run inside native Tauri desktop runtime.',
    },
    raw_sockets: false,
    interfaces_count: 0,
    platform: 'Web Browser (Development Mode)',
  };
}

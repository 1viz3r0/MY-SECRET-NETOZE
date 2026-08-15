import { isTauriEnvironment } from './isTauri';

export interface SystemInfo {
  os_name: string;
  os_version: string;
  hostname: string;
  architecture: string;
  user_name: string;
  is_admin: boolean;
}

export interface DetailedSystemInfo {
  hostname: string;
  os_name: string;
  os_version: string;
  architecture: string;
  cpu_model: string;
  cpu_core_count: number;
  ram_total_bytes: number;
  ram_available_bytes: number;
  ram_usage_percent: number;
  uptime_seconds: number;
  user_name: string;
  is_admin: boolean;
}

/**
 * Invokes native get_system_info command or returns web dev fallback
 */
export async function getSystemInfo(): Promise<SystemInfo> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SystemInfo>('get_system_info');
    } catch (err) {
      console.warn('Failed to invoke native get_system_info:', err);
    }
  }

  return {
    os_name: 'Web Browser',
    os_version: 'Web Standard API',
    hostname: 'localhost-web',
    architecture: 'wasm/js',
    user_name: 'Web User',
    is_admin: false,
  };
}

/**
 * Invokes native get_detailed_system_info command or returns web dev fallback
 */
export async function getDetailedSystemInfo(): Promise<DetailedSystemInfo> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<DetailedSystemInfo>('get_detailed_system_info');
    } catch (err) {
      console.warn('Failed to invoke native get_detailed_system_info:', err);
    }
  }

  return {
    hostname: 'localhost-web',
    os_name: 'Web Browser',
    os_version: 'Chrome Engine',
    architecture: 'x86_64',
    cpu_model: 'Web Virtual CPU',
    cpu_core_count: 8,
    ram_total_bytes: 16 * 1024 * 1024 * 1024,
    ram_available_bytes: 8 * 1024 * 1024 * 1024,
    ram_usage_percent: 50.0,
    uptime_seconds: 3600,
    user_name: 'Web Analyst',
    is_admin: false,
  };
}

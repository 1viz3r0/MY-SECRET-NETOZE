import { isTauriEnvironment } from './isTauri';

export interface AppConfig {
  selected_interface: string;
  capture_status: string;
  app_mode: string;
  theme: string;
  sqlite_path: string;
  duckdb_path: string;
}

/**
 * Invokes native get_app_config command or returns web fallback
 */
export async function getAppConfig(): Promise<AppConfig> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<AppConfig>('get_app_config');
    } catch (err) {
      console.warn('Failed to invoke native get_app_config:', err);
    }
  }

  return {
    selected_interface: 'eth0',
    capture_status: 'UNAVAILABLE (WEB MODE)',
    app_mode: 'DEMO / LAB',
    theme: 'dark_glass',
    sqlite_path: 'In-Memory (Browser)',
    duckdb_path: 'In-Memory (Browser)',
  };
}

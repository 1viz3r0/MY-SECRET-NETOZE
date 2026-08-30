/**
 * Helper function to determine if the application is running inside native Tauri runtime or browser web development mode
 */
export const isTauriEnvironment = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }
  // Primary check: __TAURI_INTERNALS__ injected by @tauri-apps/vite
  if ('__TAURI_INTERNALS__' in window) {
    return true;
  }
  // Fallback check: Tauri 2.x may expose __TAURI__ global even without @tauri-apps/vite
  // This handles cases where the Vite plugin is absent but the Tauri runtime is active
  if ((window as any).__TAURI__) {
    return true;
  }
  return false;
};

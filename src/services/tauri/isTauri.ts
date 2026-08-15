/**
 * Helper function to determine if the application is running inside native Tauri runtime or browser web development mode
 */
export const isTauriEnvironment = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
};

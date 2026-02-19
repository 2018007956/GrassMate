function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function openExternalUrl(url: string): Promise<boolean> {
  if (isTauriRuntime()) {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
      return true;
    } catch {
      return false;
    }
  }

  return window.open(url, '_blank', 'noopener,noreferrer') !== null;
}

const SETTINGS_WINDOW_LABEL = 'settings';
const SETTINGS_WINDOW_WIDTH = 680;
const SETTINGS_WINDOW_HEIGHT = 520;

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function buildSettingsWindowUrl(): string {
  const url = new URL(window.location.href);
  url.searchParams.set('window', SETTINGS_WINDOW_LABEL);
  return url.toString();
}

export function isSettingsWindowContext(): boolean {
  if (typeof window === 'undefined') return false;
  return new URL(window.location.href).searchParams.get('window') === SETTINGS_WINDOW_LABEL;
}

export async function openSettingsWindow(): Promise<boolean> {
  if (!isTauriRuntime()) return false;

  try {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const existing = await WebviewWindow.getByLabel(SETTINGS_WINDOW_LABEL);

    if (existing) {
      await existing.show();
      await existing.setFocus();
      return true;
    }

    const settingsWindow = new WebviewWindow(SETTINGS_WINDOW_LABEL, {
      url: buildSettingsWindowUrl(),
      title: 'GrassMate 설정',
      width: SETTINGS_WINDOW_WIDTH,
      height: SETTINGS_WINDOW_HEIGHT,
      resizable: false,
      center: true,
      focus: true,
    });

    await settingsWindow.once('tauri://error', () => {
      // ignore, caller handles fallback
    });

    return true;
  } catch {
    return false;
  }
}

export async function closeCurrentTauriWindow(): Promise<void> {
  if (!isTauriRuntime()) return;

  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().close();
}

import type { TrayIcon as TrayIconType } from '@tauri-apps/api/tray';
import type { TrayIconEvent } from '@tauri-apps/api/tray';
import type { Window as TauriWindow } from '@tauri-apps/api/window';

const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const MAIN_WINDOW_WIDTH = 322;
const TRAY_WINDOW_GAP = 6;
const FULLSCREEN_SPACE_BRIDGE_MS = 360;

let setupPromise: Promise<void> | null = null;
let trayIcon: TrayIconType | null = null;
let closeListenerRegistered = false;
let blurListenerRegistered = false;
let blurHideSuppressedUntil = 0;

async function setVisibleOnCurrentWorkspace(mainWindow: TauriWindow): Promise<void> {
  try {
    await mainWindow.setVisibleOnAllWorkspaces(false);
  } catch {
    // Ignore on unsupported platforms.
  }
}

async function moveWindowBelowTrayIcon(
  mainWindow: TauriWindow,
  event: TrayIconEvent,
  PhysicalPosition: typeof import('@tauri-apps/api/dpi').PhysicalPosition,
): Promise<void> {
  const trayRect = event.rect;
  const trayCenterX = trayRect.position.x + trayRect.size.width / 2;
  const x = Math.round(trayCenterX - MAIN_WINDOW_WIDTH / 2);
  const y = Math.round(trayRect.position.y + trayRect.size.height + TRAY_WINDOW_GAP);
  await mainWindow.setPosition(new PhysicalPosition(x, y));
}

async function toggleMainWindow(
  mainWindow: TauriWindow,
  context?: {
    event: TrayIconEvent;
    PhysicalPosition: typeof import('@tauri-apps/api/dpi').PhysicalPosition;
  },
): Promise<void> {
  if (await mainWindow.isVisible()) {
    blurHideSuppressedUntil = 0;
    await setVisibleOnCurrentWorkspace(mainWindow);
    await mainWindow.hide();
    return;
  }

  if (await mainWindow.isMinimized()) {
    await mainWindow.unminimize();
  }

  if (context && context.event.type === 'Click') {
    await moveWindowBelowTrayIcon(mainWindow, context.event, context.PhysicalPosition);
  }

  try {
    await mainWindow.setVisibleOnAllWorkspaces(true);
  } catch {
    // Ignore on unsupported platforms.
  }

  blurHideSuppressedUntil = Date.now() + FULLSCREEN_SPACE_BRIDGE_MS;
  await mainWindow.show();
  try {
    await mainWindow.setFocus();
  } catch {
    // On macOS fullscreen spaces focus may be denied; keep window visible.
  }
}

async function registerCloseToHide(mainWindow: TauriWindow): Promise<void> {
  if (closeListenerRegistered) {
    return;
  }

  closeListenerRegistered = true;

  await mainWindow.onCloseRequested(async (event) => {
    event.preventDefault();
    await mainWindow.hide();
  });
}

async function registerBlurToHide(mainWindow: TauriWindow): Promise<void> {
  if (blurListenerRegistered) {
    return;
  }

  blurListenerRegistered = true;

  await mainWindow.onFocusChanged(async ({ payload: focused }) => {
    if (focused) {
      return;
    }

    if (Date.now() < blurHideSuppressedUntil) {
      return;
    }

    if (await mainWindow.isVisible()) {
      blurHideSuppressedUntil = 0;
      await setVisibleOnCurrentWorkspace(mainWindow);
      await mainWindow.hide();
    }
  });
}

async function setupTrayInternal(): Promise<void> {
  const [
    { defaultWindowIcon },
    { Menu, MenuItem, PredefinedMenuItem },
    { TrayIcon },
    { getCurrentWindow },
    { exit },
    { PhysicalPosition },
  ] = await Promise.all([
    import('@tauri-apps/api/app'),
    import('@tauri-apps/api/menu'),
    import('@tauri-apps/api/tray'),
    import('@tauri-apps/api/window'),
    import('@tauri-apps/plugin-process'),
    import('@tauri-apps/api/dpi'),
  ]);

  const mainWindow = getCurrentWindow();
  if (mainWindow.label !== 'main') {
    return;
  }

  await registerCloseToHide(mainWindow);
  await registerBlurToHide(mainWindow);

  const toggleItem = await MenuItem.new({
    text: '열기/숨기기',
    action: () => {
      void toggleMainWindow(mainWindow);
    },
  });

  const separator = await PredefinedMenuItem.new({ item: 'Separator' });

  const quitItem = await MenuItem.new({
    text: '종료',
    action: () => {
      void exit(0);
    },
  });

  const menu = await Menu.new({
    items: [toggleItem, separator, quitItem],
  });

  const icon = await defaultWindowIcon();

  trayIcon = await TrayIcon.new({
    icon: icon ?? undefined,
    iconAsTemplate: true,
    menu,
    showMenuOnLeftClick: false,
    action: (event) => {
      if (
        event.type === 'Click' &&
        event.button === 'Left' &&
        event.buttonState === 'Up'
      ) {
        void toggleMainWindow(mainWindow, { event, PhysicalPosition });
      }
    },
  });

  await trayIcon.setIconAsTemplate(true);
}

export function setupTray(): Promise<void> {
  if (!isTauri()) {
    return Promise.resolve();
  }

  if (!setupPromise) {
    setupPromise = setupTrayInternal().catch((error) => {
      setupPromise = null;
      throw error;
    });
  }

  return setupPromise;
}

import { app, globalShortcut, ipcMain, type BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../src/shared';

let currentWindow: BrowserWindow | null = null;
let initialY = 40;
let hasShownOnce = false;
let handlersRegistered = false;
let shortcutsRegistered = false;
let triggerAnswerHandler: (() => void) | null = null;
let captureFullHandler: (() => void) | null = null;
let captureSelectiveHandler: (() => void) | null = null;

export function initWindowHandlers(mainWindow: BrowserWindow): void {
  currentWindow = mainWindow;
  initialY = mainWindow.getBounds().y;
  hasShownOnce = false;

  if (handlersRegistered) {
    return;
  }
  handlersRegistered = true;

  ipcMain.handle(IPC_CHANNELS.hideWindow, () => {
    currentWindow?.hide();
    currentWindow?.setIgnoreMouseEvents(true);
  });

  ipcMain.handle(IPC_CHANNELS.showWindow, () => {
    currentWindow?.show();
    currentWindow?.focus();
    currentWindow?.setIgnoreMouseEvents(false);
  });

  ipcMain.handle(IPC_CHANNELS.moveWindow, (_event, direction: 'up' | 'down' | 'left' | 'right') => {
    if (!currentWindow) {
      return;
    }

    const [x, y] = currentWindow.getPosition();
    const delta = 20;
    const next = {
      up: [x, y - delta],
      down: [x, y + delta],
      left: [x - delta, y],
      right: [x + delta, y]
    }[direction];
    currentWindow.setPosition(next[0], next[1]);
  });

  ipcMain.handle(IPC_CHANNELS.updateContentDimensions, (_event, dimensions: { width: number; height: number }) => {
    if (!currentWindow) {
      return;
    }

    const width = Math.max(720, Math.ceil(dimensions.width));
    const height = Math.max(120, Math.ceil(dimensions.height));
    const clampedWidth = Math.min(width, 720);
    const clampedHeight = Math.min(height, 560);
    const [currentX] = currentWindow.getPosition();
    const [, currentHeight] = currentWindow.getContentSize();
    if (Math.abs(currentHeight - clampedHeight) > 4) {
      currentWindow.setBounds({
        x: currentX,
        y: initialY,
        width: clampedWidth,
        height: clampedHeight
      }, true);
    }
    if (!hasShownOnce) {
      hasShownOnce = true;
      currentWindow.show();
      currentWindow.focus();
      currentWindow.setIgnoreMouseEvents(false);
    }
  });

  ipcMain.handle(IPC_CHANNELS.setWindowOpacity, (_event, opacity: number) => {
    if (!currentWindow) {
      return;
    }
    const next = Math.max(0.7, Math.min(1, opacity));
    currentWindow.setOpacity(next);
  });

  ipcMain.handle(IPC_CHANNELS.setWindowClickThrough, (_event, enabled: boolean) => {
    currentWindow?.setIgnoreMouseEvents(Boolean(enabled), { forward: Boolean(enabled) });
  });

  ipcMain.handle(IPC_CHANNELS.quitApp, () => {
    app.quit();
  });
}

export function registerWindowShortcuts(
  mainWindow: BrowserWindow,
  onTriggerAnswer: () => void,
  captureFull: () => void,
  captureSelective: () => void
): void {
  currentWindow = mainWindow;
  triggerAnswerHandler = onTriggerAnswer;
  captureFullHandler = captureFull;
  captureSelectiveHandler = captureSelective;

  if (shortcutsRegistered) {
    return;
  }
  shortcutsRegistered = true;

  const commandOrControl = process.platform === 'darwin' ? 'Command' : 'Control';
  const moveBy = (dx: number, dy: number) => {
    if (!currentWindow) {
      return;
    }
    const [x, y] = currentWindow.getPosition();
    currentWindow.setPosition(x + dx, y + dy);
  };

  globalShortcut.register(`${commandOrControl}+B`, () => {
    if (!currentWindow) {
      return;
    }

    if (currentWindow.isVisible()) {
      currentWindow.hide();
      currentWindow.setIgnoreMouseEvents(true);
    } else {
      currentWindow.show();
      currentWindow.focus();
      currentWindow.setIgnoreMouseEvents(false);
    }
  });

  globalShortcut.register(`${commandOrControl}+H`, () => captureFullHandler?.());
  globalShortcut.register(`${commandOrControl}+Shift+H`, () => captureSelectiveHandler?.());
  globalShortcut.register(`${commandOrControl}+Enter`, () => triggerAnswerHandler?.());
  globalShortcut.register(`${commandOrControl}+Q`, () => app.quit());
  globalShortcut.register(`${commandOrControl}+Up`, () => moveBy(0, -20));
  globalShortcut.register(`${commandOrControl}+Down`, () => moveBy(0, 20));
  globalShortcut.register(`${commandOrControl}+Left`, () => moveBy(-20, 0));
  globalShortcut.register(`${commandOrControl}+Right`, () => moveBy(20, 0));
}

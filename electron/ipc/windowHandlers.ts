import { app, globalShortcut, ipcMain, type BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../src/shared';

export function initWindowHandlers(mainWindow: BrowserWindow): void {
  let hasShownOnce = false;

  ipcMain.handle(IPC_CHANNELS.hideWindow, () => {
    mainWindow.hide();
    mainWindow.setIgnoreMouseEvents(true);
  });

  ipcMain.handle(IPC_CHANNELS.showWindow, () => {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.setIgnoreMouseEvents(false);
  });

  ipcMain.handle(IPC_CHANNELS.moveWindow, (_event, direction: 'up' | 'down' | 'left' | 'right') => {
    const [x, y] = mainWindow.getPosition();
    const delta = 20;
    const next = {
      up: [x, y - delta],
      down: [x, y + delta],
      left: [x - delta, y],
      right: [x + delta, y]
    }[direction];
    mainWindow.setPosition(next[0], next[1]);
  });

  ipcMain.handle(IPC_CHANNELS.updateContentDimensions, (_event, dimensions: { width: number; height: number }) => {
    const width = Math.max(720, Math.ceil(dimensions.width));
    const height = Math.max(120, Math.ceil(dimensions.height));
    const clampedWidth = Math.min(width, 720);
    const clampedHeight = Math.min(height, 360);
    const [, currentHeight] = mainWindow.getContentSize();
    if (Math.abs(currentHeight - clampedHeight) > 4) {
      mainWindow.setContentSize(clampedWidth, clampedHeight, false);
    }
    if (!hasShownOnce) {
      hasShownOnce = true;
      mainWindow.show();
      mainWindow.focus();
      mainWindow.setIgnoreMouseEvents(false);
    }
  });

  ipcMain.handle(IPC_CHANNELS.setWindowOpacity, (_event, opacity: number) => {
    const next = Math.max(0.7, Math.min(1, opacity));
    mainWindow.setOpacity(next);
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
  const commandOrControl = process.platform === 'darwin' ? 'Command' : 'Control';
  const moveBy = (dx: number, dy: number) => {
    const [x, y] = mainWindow.getPosition();
    mainWindow.setPosition(x + dx, y + dy);
  };

  globalShortcut.register(`${commandOrControl}+B`, () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
      mainWindow.setIgnoreMouseEvents(true);
    } else {
      mainWindow.show();
      mainWindow.focus();
      mainWindow.setIgnoreMouseEvents(false);
    }
  });

  globalShortcut.register(`${commandOrControl}+H`, captureFull);
  globalShortcut.register(`${commandOrControl}+Shift+H`, captureSelective);
  globalShortcut.register(`${commandOrControl}+Enter`, onTriggerAnswer);
  globalShortcut.register(`${commandOrControl}+Q`, () => app.quit());
  globalShortcut.register(`${commandOrControl}+Up`, () => moveBy(0, -20));
  globalShortcut.register(`${commandOrControl}+Down`, () => moveBy(0, 20));
  globalShortcut.register(`${commandOrControl}+Left`, () => moveBy(-20, 0));
  globalShortcut.register(`${commandOrControl}+Right`, () => moveBy(20, 0));
}

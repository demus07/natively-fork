import {
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  screen,
  type BrowserWindowConstructorOptions
} from 'electron';
import { IPC_CHANNELS } from '../../src/shared';

let currentWindow: BrowserWindow | null = null;
let screenshotHandlersRegistered = false;
let includeOverlayInScreenshots = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createOverlayWindow(parent?: BrowserWindow): BrowserWindow {
  const display = screen.getPrimaryDisplay();
  const options: BrowserWindowConstructorOptions = {
    width: display.bounds.width,
    height: display.bounds.height,
    x: display.bounds.x,
    y: display.bounds.y,
    transparent: true,
    frame: false,
    fullscreen: true,
    movable: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    ...(parent ? { parent } : {}),
    show: true,
    webPreferences: {
      sandbox: false,
      nodeIntegration: true,
      contextIsolation: false
    }
  };

  const overlay = new BrowserWindow(options);
  overlay.setIgnoreMouseEvents(false);
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.loadURL(
    `data:text/html;charset=UTF-8,${encodeURIComponent(`
      <!doctype html>
      <html>
        <body style="margin:0;overflow:hidden;background:rgba(0,0,0,0.18);cursor:crosshair;">
          <canvas id="selection" width="${display.bounds.width}" height="${display.bounds.height}"></canvas>
          <script>
            const { ipcRenderer } = require('electron');
            const canvas = document.getElementById('selection');
            const ctx = canvas.getContext('2d');
            let start = null;
            let current = null;
            function draw() {
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              ctx.fillStyle = 'rgba(0,0,0,0.18)';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              if (!start || !current) return;
              const x = Math.min(start.x, current.x);
              const y = Math.min(start.y, current.y);
              const width = Math.abs(current.x - start.x);
              const height = Math.abs(current.y - start.y);
              ctx.clearRect(x, y, width, height);
              ctx.strokeStyle = '#6366f1';
              ctx.lineWidth = 2;
              ctx.strokeRect(x, y, width, height);
            }
            canvas.addEventListener('mousedown', (event) => {
              start = { x: event.clientX, y: event.clientY };
              current = start;
              draw();
            });
            canvas.addEventListener('mousemove', (event) => {
              if (!start) return;
              current = { x: event.clientX, y: event.clientY };
              draw();
            });
            window.addEventListener('mouseup', (event) => {
              if (!start) return;
              current = { x: event.clientX, y: event.clientY };
              const rect = {
                x: Math.min(start.x, current.x),
                y: Math.min(start.y, current.y),
                width: Math.abs(current.x - start.x),
                height: Math.abs(current.y - start.y)
              };
              ipcRenderer.send('selection-made', rect);
            });
            window.addEventListener('keydown', (event) => {
              if (event.key === 'Escape') {
                ipcRenderer.send('selection-made', null);
              }
            });
          </script>
        </body>
      </html>
    `)}`
  );
  return overlay;
}

async function capturePrimaryDisplay(): Promise<Electron.NativeImage> {
  const display = screen.getPrimaryDisplay();
  const scaleFactor = display.scaleFactor;
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.floor(display.bounds.width * scaleFactor),
      height: Math.floor(display.bounds.height * scaleFactor)
    }
  });

  const source = sources.find((item) => item.display_id === `${display.id}`) ?? sources[0];
  if (!source) {
    throw new Error('No screen sources available.');
  }
  return source.thumbnail;
}

export function initScreenshotHandlers(mainWindow: BrowserWindow): {
  captureFullScreen: () => Promise<string>;
  captureSelectiveScreen: () => Promise<string>;
} {
  currentWindow = mainWindow;

  const captureWithOverlayPreference = async <T>(capture: () => Promise<T>): Promise<T> => {
    const shouldHide = !includeOverlayInScreenshots && Boolean(currentWindow?.isVisible());
    if (!shouldHide) {
      return capture();
    }

    currentWindow?.hide();
    currentWindow?.setIgnoreMouseEvents(true);
    await sleep(120);

    try {
      return await capture();
    } finally {
      currentWindow?.show();
      currentWindow?.focus();
      currentWindow?.setIgnoreMouseEvents(false);
    }
  };

  const captureFullScreen = async (): Promise<string> =>
    captureWithOverlayPreference(async () => {
      const image = await capturePrimaryDisplay();
      return image.toPNG().toString('base64');
    });

  const captureSelectiveScreen = async (): Promise<string> =>
    captureWithOverlayPreference(
      () =>
        new Promise<string>((resolve, reject) => {
          const overlay = createOverlayWindow(includeOverlayInScreenshots ? currentWindow ?? undefined : undefined);
      const cleanup = () => {
        ipcMain.removeListener('selection-made', onSelectionMade);
        if (!overlay.isDestroyed()) {
          overlay.close();
        }
      };

      const onSelectionMade = async (
        _event: Electron.IpcMainEvent,
        rect: { x: number; y: number; width: number; height: number } | null
      ) => {
        cleanup();
        if (!rect || rect.width === 0 || rect.height === 0) {
          reject(new Error('Selection cancelled.'));
          return;
        }

        try {
          const display = screen.getPrimaryDisplay();
          const scaleFactor = display.scaleFactor;
          const image = await capturePrimaryDisplay();
          const cropped = image.crop({
            x: Math.floor(rect.x * scaleFactor),
            y: Math.floor(rect.y * scaleFactor),
            width: Math.floor(rect.width * scaleFactor),
            height: Math.floor(rect.height * scaleFactor)
          });
          resolve(cropped.toPNG().toString('base64'));
        } catch (error) {
          reject(error instanceof Error ? error : new Error('Failed to capture selected region.'));
        }
      };

          ipcMain.on('selection-made', onSelectionMade);
        })
    );

  if (!screenshotHandlersRegistered) {
    screenshotHandlersRegistered = true;
    ipcMain.handle(IPC_CHANNELS.captureFullScreen, captureFullScreen);
    ipcMain.handle(IPC_CHANNELS.captureSelectiveScreen, captureSelectiveScreen);
    ipcMain.handle(IPC_CHANNELS.setScreenshotOverlayVisibility, (_event, visible: boolean) => {
      includeOverlayInScreenshots = Boolean(visible);
    });
  }

  return { captureFullScreen, captureSelectiveScreen };
}

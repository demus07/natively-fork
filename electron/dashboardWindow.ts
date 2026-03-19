import { BrowserWindow, app } from 'electron';
import isDev from 'electron-is-dev';
import { WINDOW_CONFIG } from '../src/config';
import path from 'node:path';

let dashboardWindow: BrowserWindow | null = null;

function dashboardUrl(sessionId?: string): string {
  const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
  if (isDev) {
    return `${process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5193'}/dashboard.html${query}`;
  }
  return path.join(app.getAppPath(), 'dist/renderer', `dashboard.html${query}`);
}

export function openDashboardWindow(sessionId?: string): BrowserWindow {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    if (isDev) {
      void dashboardWindow.loadURL(dashboardUrl(sessionId));
    } else {
      void dashboardWindow.loadFile(path.join(app.getAppPath(), 'dist/renderer/dashboard.html'), {
        query: sessionId ? { sessionId } : undefined
      });
    }
    dashboardWindow.show();
    dashboardWindow.focus();
    return dashboardWindow;
  }

  dashboardWindow = new BrowserWindow({
    width: WINDOW_CONFIG.dashboard.width,
    height: WINDOW_CONFIG.dashboard.height,
    minWidth: 900,
    minHeight: 620,
    show: false,
    resizable: true,
    title: 'Natively Dashboard',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  if (isDev) {
    void dashboardWindow.loadURL(dashboardUrl(sessionId));
  } else {
    void dashboardWindow.loadFile(path.join(app.getAppPath(), 'dist/renderer/dashboard.html'), {
      query: sessionId ? { sessionId } : undefined
    });
  }

  dashboardWindow.once('ready-to-show', () => {
    dashboardWindow?.show();
    dashboardWindow?.focus();
  });

  dashboardWindow.on('closed', () => {
    dashboardWindow = null;
  });

  return dashboardWindow;
}

export function getDashboardWindow(): BrowserWindow | null {
  return dashboardWindow && !dashboardWindow.isDestroyed() ? dashboardWindow : null;
}

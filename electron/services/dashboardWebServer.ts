import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import path from 'node:path';
import { app } from 'electron';
import isDev from 'electron-is-dev';
import { DASHBOARD_WEB_CONFIG } from '../../src/config';
import { getAllSettings, saveAllSettings } from './database';
import { launchOverlayFromDashboard } from './dashboardCommands';
import { dashboardEvents } from './dashboardEvents';
import { sessionService } from './SessionService';
import { summarizationService } from './SummarizationService';

type JsonResult = {
  ok: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
  };
};

let server: Server | null = null;
let removeSummaryListener: (() => void) | null = null;
const sseClients = new Set<ServerResponse<IncomingMessage>>();
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8'
};

function dashboardOrigin(): string {
  return `http://${DASHBOARD_WEB_CONFIG.host}:${DASHBOARD_WEB_CONFIG.port}`;
}

export function getDashboardAppUrl(sessionId?: string): string {
  const url = new URL('/dashboard', dashboardOrigin());
  if (sessionId) {
    url.searchParams.set('sessionId', sessionId);
  }
  return url.toString();
}

function withCors(response: ServerResponse<IncomingMessage>): void {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(response: ServerResponse<IncomingMessage>, statusCode: number, payload: JsonResult): void {
  withCors(response);
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return {} as T;
  }

  return JSON.parse(raw) as T;
}

function matchesDashboardRoute(pathname: string): string | null {
  if (!pathname.startsWith(DASHBOARD_WEB_CONFIG.apiBasePath)) {
    return null;
  }

  const suffix = pathname.slice(DASHBOARD_WEB_CONFIG.apiBasePath.length);
  return suffix.length > 0 ? suffix : '/';
}

function isDashboardPageRoute(pathname: string): boolean {
  return pathname === '/dashboard' || pathname === '/dashboard.html' || pathname.startsWith('/assets/');
}

function rendererDistPath(relativePath: string): string {
  return path.join(app.getAppPath(), 'dist/renderer', relativePath);
}

async function serveDashboardAsset(
  pathname: string,
  response: ServerResponse<IncomingMessage>,
  search: string
): Promise<boolean> {
  if (!isDashboardPageRoute(pathname)) {
    return false;
  }

  if (isDev) {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5193';
    const targetPath = pathname === '/dashboard' ? '/dashboard.html' : pathname;
    response.statusCode = 302;
    response.setHeader('Location', `${devServerUrl}${targetPath}${search}`);
    response.end();
    return true;
  }

  const relativePath = pathname === '/dashboard' || pathname === '/dashboard.html'
    ? 'dashboard.html'
    : pathname.slice(1);
  const absolutePath = rendererDistPath(relativePath);

  try {
    const file = await readFile(absolutePath);
    response.statusCode = 200;
    response.setHeader('Content-Type', MIME_TYPES[path.extname(absolutePath)] || 'application/octet-stream');
    response.end(file);
    return true;
  } catch {
    response.statusCode = 404;
    response.end('Dashboard asset not found');
    return true;
  }
}

function attachSseClient(response: ServerResponse<IncomingMessage>): void {
  withCors(response);
  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive'
  });
  response.write(': connected\n\n');
  sseClients.add(response);
  response.on('close', () => {
    sseClients.delete(response);
  });
}

function broadcastSummaryUpdate(payload: { sessionId: string; summary: unknown }): void {
  const message = `event: session-summary-update\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    client.write(message);
  }
}

async function handleDashboardRequest(
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>
): Promise<void> {
  const requestUrl = new URL(
    request.url || '/',
    dashboardOrigin()
  );

  if (request.method === 'GET' && (await serveDashboardAsset(requestUrl.pathname, response, requestUrl.search))) {
    return;
  }

  const route = matchesDashboardRoute(requestUrl.pathname);
  if (!route) {
    sendJson(response, 404, {
      ok: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Dashboard route not found'
      }
    });
    return;
  }

  if (request.method === 'OPTIONS') {
    withCors(response);
    response.statusCode = 204;
    response.end();
    return;
  }

  if (request.method === 'GET' && route === '/events') {
    attachSseClient(response);
    return;
  }

  try {
    if (request.method === 'GET' && route === '/sessions') {
      const limit = Number(requestUrl.searchParams.get('limit') || '') || undefined;
      const sessions = await sessionService.getSessions(limit);
      sendJson(response, 200, { ok: true, data: sessions });
      return;
    }

    if (request.method === 'GET' && route.startsWith('/sessions/')) {
      const sessionId = decodeURIComponent(route.slice('/sessions/'.length));
      const session = await sessionService.getSession(sessionId);
      sendJson(response, 200, { ok: true, data: session });
      return;
    }

    if (request.method === 'POST' && route === '/overlay/launch') {
      await launchOverlayFromDashboard();
      sendJson(response, 200, { ok: true, data: null });
      return;
    }

    if (request.method === 'POST' && route.endsWith('/summarize') && route.startsWith('/sessions/')) {
      const sessionId = decodeURIComponent(route.slice('/sessions/'.length, -'/summarize'.length));
      void summarizationService.summarizeSession(sessionId).catch((error) => {
        console.warn('[DASHBOARD API] Failed to trigger session summarization', {
          sessionId,
          error: error instanceof Error ? error.message : String(error)
        });
      });
      sendJson(response, 202, { ok: true, data: null });
      return;
    }

    if ((request.method === 'PATCH' || request.method === 'PUT') && route.startsWith('/sessions/')) {
      const sessionId = decodeURIComponent(route.slice('/sessions/'.length));
      const body = await readJsonBody<{ title?: string }>(request);
      if (!body.title) {
        sendJson(response, 400, {
          ok: false,
          error: {
            code: 'INVALID_BODY',
            message: 'title is required'
          }
        });
        return;
      }
      const session = await sessionService.renameSession(sessionId, body.title);
      sendJson(response, 200, { ok: true, data: session });
      return;
    }

    if (request.method === 'DELETE' && route.startsWith('/sessions/')) {
      const sessionId = decodeURIComponent(route.slice('/sessions/'.length));
      await sessionService.deleteSession(sessionId);
      sendJson(response, 200, { ok: true, data: null });
      return;
    }

    if (request.method === 'GET' && route === '/settings') {
      sendJson(response, 200, { ok: true, data: getAllSettings() });
      return;
    }

    if ((request.method === 'POST' || request.method === 'PUT') && route === '/settings') {
      const body = await readJsonBody<Record<string, unknown>>(request);
      const saved = await saveAllSettings({
        ...getAllSettings(),
        ...body
      });
      sendJson(response, 200, { ok: true, data: saved });
      return;
    }

    sendJson(response, 404, {
      ok: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Dashboard route not found'
      }
    });
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      error: {
        code: 'DASHBOARD_API_ERROR',
        message: error instanceof Error ? error.message : 'Unknown dashboard API error'
      }
    });
  }
}

async function canReuseExistingDashboardServer(): Promise<boolean> {
  try {
    const response = await fetch(`${dashboardOrigin()}${DASHBOARD_WEB_CONFIG.apiBasePath}/sessions?limit=1`, {
      signal: AbortSignal.timeout(1000)
    });
    if (!response.ok) {
      return false;
    }

    const payload = await response.json() as { ok?: boolean };
    return payload.ok === true;
  } catch {
    return false;
  }
}

export async function startDashboardWebServer(): Promise<void> {
  if (server) {
    return;
  }

  removeSummaryListener = dashboardEvents.onSummaryUpdate((payload) => {
    broadcastSummaryUpdate(payload);
  });

  const nextServer = createServer((request, response) => {
    void handleDashboardRequest(request, response);
  });

  try {
    await new Promise<void>((resolve, reject) => {
      nextServer.once('error', reject);
      nextServer.listen(DASHBOARD_WEB_CONFIG.port, DASHBOARD_WEB_CONFIG.host, () => {
        nextServer.off('error', reject);
        server = nextServer;
        console.log('[DASHBOARD API] Listening', {
          host: DASHBOARD_WEB_CONFIG.host,
          port: DASHBOARD_WEB_CONFIG.port
        });
        resolve();
      });
    });
  } catch (error) {
    removeSummaryListener?.();
    removeSummaryListener = null;

    if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE' && (await canReuseExistingDashboardServer())) {
      console.warn('[DASHBOARD API] Reusing existing dashboard server on port', DASHBOARD_WEB_CONFIG.port);
      return;
    }

    throw error;
  }
}

export async function stopDashboardWebServer(): Promise<void> {
  if (!server) {
    return;
  }

  removeSummaryListener?.();
  removeSummaryListener = null;

  for (const client of sseClients) {
    client.end();
  }
  sseClients.clear();

  const closingServer = server;
  server = null;

  await new Promise<void>((resolve, reject) => {
    closingServer.close((error) => {
      if (error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

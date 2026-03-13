import { spawn } from 'node:child_process';
import net from 'node:net';
import process from 'node:process';

const HOST = '127.0.0.1';
const START_PORT = 5193;

function findOpenPort(startPort) {
  return new Promise((resolve, reject) => {
    const tryPort = (port) => {
      const server = net.createServer();
      server.unref();
      server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          tryPort(port + 1);
          return;
        }
        reject(error);
      });
      server.listen(port, HOST, () => {
        const address = server.address();
        const resolvedPort = typeof address === 'object' && address ? address.port : port;
        server.close((closeError) => {
          if (closeError) {
            reject(closeError);
            return;
          }
          resolve(resolvedPort);
        });
      });
    };

    tryPort(startPort);
  });
}

function waitForServer(url, timeoutMs = 30_000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const poll = () => {
      fetch(url)
        .then((response) => {
          if (response.ok) {
            resolve();
            return;
          }
          throw new Error(`Unexpected status: ${response.status}`);
        })
        .catch((error) => {
          if (Date.now() - startedAt > timeoutMs) {
            reject(error);
            return;
          }
          setTimeout(poll, 300);
        });
    };

    poll();
  });
}

const children = [];

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

const port = await findOpenPort(START_PORT);
const rendererUrl = `http://${HOST}:${port}`;

const vite = spawn(
  'npx',
  ['vite', '--host', HOST, '--port', String(port), '--strictPort'],
  {
    stdio: 'inherit',
    env: {
      ...process.env
    }
  }
);

children.push(vite);

vite.on('exit', (code) => {
  if (code && code !== 0) {
    shutdown(code);
  }
});

await waitForServer(rendererUrl);

const electron = spawn('npx', ['electron', '.'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: rendererUrl
  }
});

children.push(electron);

electron.on('exit', (code) => {
  shutdown(code ?? 0);
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function readBody(req: any): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: any) => {
      body += typeof chunk === 'string' ? chunk : String(chunk);
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function handleGithubOAuthProxy(req: any, res: any): Promise<boolean> {
  if (req.method !== 'POST') return false;
  if (!req.url?.startsWith('/__github/')) return false;

  const path = req.url.replace(/^\/__github/, '');
  const body = await readBody(req);

  try {
    const upstream = await fetch(`https://github.com${path}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    const text = await upstream.text();
    res.statusCode = upstream.status;
    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json');
    res.end(text);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OAuth proxy failed.';
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'proxy_error', message }));
    return true;
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'github-oauth-proxy',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (await handleGithubOAuthProxy(req, res)) return;
          next();
        });
      },
      configurePreviewServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (await handleGithubOAuthProxy(req, res)) return;
          next();
        });
      },
    },
  ],
});

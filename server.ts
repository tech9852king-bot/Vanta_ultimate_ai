/**
 * VANTA AI — Universal Infrastructure Intelligence OS Server
 * Full-stack Express entrypoint mounting correlation IDs, API routes, camera assets,
 * Vite middleware (dev) / dist static assets (prod), and graceful WAL checkpoint shutdown.
 */

import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { loadRuntimeConfig } from './src/server/config.ts';
import { initDatabase } from './src/server/db.ts';
import { correlationMiddleware } from './src/server/observability.ts';
import { createScopedRateLimiter } from './src/server/rateLimit.ts';
import { createApiRouter } from './src/server/routes.ts';

async function bootstrap() {
  // Fail-closed config check before opening DB or HTTP sockets
  const cfg = loadRuntimeConfig();

  const app = express();
  app.set('trust proxy', cfg.trustProxyHops);
  app.use(correlationMiddleware);
  app.use(express.json({ limit: '4mb' }));
  app.use(
    '/api',
    createScopedRateLimiter({
      scope: 'global-api',
      maxRequests: 500,
      windowMs: 60_000,
      keyBy: 'IP',
    })
  );

  // Serve generated camera assets in both dev and production builds
  const assetsDir = path.resolve(process.cwd(), 'src', 'assets', 'images');
  app.use('/src/assets/images', express.static(assetsDir));

  const db = initDatabase({ config: cfg });
  const apiRouter = createApiRouter(db, cfg);
  app.use('/api', apiRouter);

  if (cfg.isProduction) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.use((_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const server = http.createServer(app);
  const maxListenRetries = 10;
  let listenAttempts = 0;

  const startListening = () => {
    listenAttempts += 1;
    server.listen(cfg.port, '0.0.0.0');
  };

  server.on('listening', () => {
    console.log(
      JSON.stringify({
        level: 'info',
        event: 'VANTA_SERVER_STARTED',
        port: cfg.port,
        nodeEnv: cfg.nodeEnv,
        geminiConfigured: cfg.geminiConfigured,
        allowDemoAuth: cfg.allowDemoAuth,
      })
    );
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE' && listenAttempts < maxListenRetries) {
      setTimeout(() => {
        try {
          server.close();
        } catch {
          // Ignore
        }
        startListening();
      }, 300);
      return;
    }
    console.error('Failed to bind VANTA AI HTTP server:', err.message);
    process.exit(1);
  });

  startListening();

  let shuttingDown = false;
  const gracefulShutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(JSON.stringify({ level: 'info', event: 'VANTA_SHUTDOWN_STARTED', signal }));

    apiRouter.closeAllSseStreams?.();
    server.closeIdleConnections?.();
    server.closeAllConnections?.();

    server.close(() => {
      try {
        db.exec('PRAGMA wal_checkpoint(PASSIVE);');
        db.close();
      } catch {
        // Ignore DB cleanup errors on shutdown
      }
      process.exit(0);
    });

    setTimeout(() => {
      try {
        db.close();
      } catch {
        // Ignore
      }
      process.exit(0);
    }, 500).unref();
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('Failed to start VANTA AI server:', err instanceof Error ? err.message : err);
  process.exit(1);
});

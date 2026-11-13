/**
 * VANTA AI — Universal Infrastructure Intelligence OS Server
 * Full-stack Express entrypoint mounting API routes and Vite middleware (dev) or dist static assets (prod).
 */

import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { initDatabase } from './src/server/db';
import { createApiRouter } from './src/server/routes';
import { createRateLimiter } from './src/server/security';

const PORT = Number(process.env.PORT || 3000);

async function bootstrap() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/api', createRateLimiter(300, 60_000));

  const db = initDatabase();
  app.use('/api', createApiRouter(db));

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VANTA AI OS running on http://0.0.0.0:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start VANTA AI server:', err);
  process.exit(1);
});

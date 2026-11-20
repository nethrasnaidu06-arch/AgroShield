import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { initializeDatabase } from './src/database/db.ts';
import { apiRouter } from './src/api/routes.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  initializeDatabase();

  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '15mb' }));
  app.use('/api', apiRouter);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AgroShield server running at http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start AgroShield server:', err);
  process.exit(1);
});

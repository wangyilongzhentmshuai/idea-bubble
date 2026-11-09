import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import { config } from './config.js';
import { openDb } from './store/sqlite.js';
import { createRepository } from './store/repository.js';
import { createBubbleRouter } from './routes/bubbles.js';
import { createJarRouter } from './routes/jars.js';
import { createIdeaRouter } from './routes/ideas.js';
import { startIdempotencySweep } from './utils/idempotency.js';

fs.mkdirSync(config.paths.audioDir, { recursive: true });

const db = openDb(config.paths.dbFile);
const repo = createRepository(db);

const app = express();
app.use(
  cors({
    origin: config.corsOrigin,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Idempotency-Key'],
  })
);
app.use(express.json({ limit: '1mb' }));

app.use('/api/ideas', createIdeaRouter(repo));
app.use('/api/bubbles', createBubbleRouter(repo));
app.use('/api/jars', createJarRouter(repo));

app.use(express.static(config.paths.publicDir));

app.use('/api', (req, res) => {
  res.status(404).json({ code: 404, data: null, message: 'api not found' });
});

app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(500).json({ code: 500, data: null, message: 'internal server error' });
});

const server = app.listen(config.port, () => {
  console.log(`灵感泡泡罐 server running at http://localhost:${config.port}`);
});

const sweepTimer = startIdempotencySweep();
sweepTimer.unref();

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

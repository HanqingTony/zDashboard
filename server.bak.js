import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { existsSync, mkdirSync } from 'fs';
import { PORT, HOST, AUDIO_DIR } from './src/config.js';
import db from './src/db.js';
import { audioRouter, audioState } from './src/routes/audio.js';
import { articlesRouter } from './src/routes/articles.js';
import { vocabRouter } from './src/routes/vocab.js';

const app = express();
const server = createServer(app);
app.use(express.json({ limit: '10mb' }));

// Ensure audio dir exists
if (!existsSync(AUDIO_DIR)) {
  mkdirSync(AUDIO_DIR, { recursive: true });
  console.log(`[init] 创建音频目录: ${AUDIO_DIR}`);
}

// Static files
app.use(express.static('public'));

// Routes
app.use(audioRouter);
app.use(articlesRouter);
app.use(vocabRouter);

// WebSocket
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'status', data: { queueLength: audioState.queue.length, isPlaying: audioState.isPlaying } }));
  ws.on('close', () => {});
});

// Play queue loop
setInterval(() => {
  if (audioState.isPlaying || audioState.queue.length === 0) return;
  const item = audioState.queue.shift();
  audioState.currentFile = item.path;
  audioState.isPlaying = true;
  wss.clients.forEach(c => {
    if (c.readyState === 1) c.send(JSON.stringify({ type: 'play', data: item }));
  });
}, 200);

// Graceful shutdown: checkpoint WAL and close db
function shutdown(signal) {
  console.log(`\n[shutdown] ${signal} — flushing WAL and closing database...`);
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
    console.log('[shutdown] ✓ Database checkpointed and closed.');
  } catch (e) {
    console.error('[shutdown] Database close error:', e.message);
  }
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Start
server.listen(PORT, HOST, () => {
  console.log(`[zdashboard] http://${HOST}:${PORT}`);
  console.log(`[zdashboard] 音频目录: ${AUDIO_DIR}`);
  console.log(`[zdashboard] POST /api/play {"path":"..."} 播放音频`);
  console.log(`[zdashboard] 英语学习: /api/articles, /api/words, /api/vocab/stats`);
});

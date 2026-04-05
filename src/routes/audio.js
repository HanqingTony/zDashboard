import { Router } from 'express';
import { existsSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { AUDIO_DIR } from '../config.js';
import { randomUUID } from 'crypto';

const router = Router();

// Audio state (mutable object for cross-module reference)
const audioState = { queue: [], isPlaying: false, currentFile: null };

// GET /api/audio - list audio files
router.get('/api/audio', (req, res) => {
  if (!existsSync(AUDIO_DIR)) return res.json([]);
  const files = readdirSync(AUDIO_DIR)
    .filter(f => ['.flac','.mp3','.wav','.ogg','.m4a','.webm','.aac'].includes(extname(f).toLowerCase()))
    .map(f => {
      const stat = statSync(join(AUDIO_DIR, f));
      return { name: f, size: stat.size, mtime: stat.mtime };
    })
    .sort((a, b) => b.mtime - a.mtime);
  res.json(files);
});

// POST /api/play - play audio file
router.post('/api/play', (req, res) => {
  const { path: filePath } = req.body;
  if (!filePath) return res.status(400).json({ error: '缺少 path 参数' });
  audioState.queue.push({ id: randomUUID(), path: filePath, addedAt: new Date().toISOString() });
  console.log(`[audio] 入队: ${filePath} (队列: ${audioState.queue.length})`);
  res.json({ ok: true, queueLength: audioState.queue.length });
});

// POST /api/skip - skip current audio
router.post('/api/skip', (req, res) => {
  audioState.isPlaying = false;
  audioState.currentFile = null;
  console.log('[audio] 跳过');
  res.json({ ok: true });
});

// POST /api/clear - clear queue
router.post('/api/clear', (req, res) => {
  audioState.queue.length = 0;
  audioState.isPlaying = false;
  audioState.currentFile = null;
  console.log('[audio] 队列已清空');
  res.json({ ok: true });
});

export { router as audioRouter, audioState };

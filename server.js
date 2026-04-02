import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join, resolve, basename, extname } from 'path';
import { existsSync, readdirSync, statSync } from 'fs';

// ========== 配置 ==========
const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3100;
const AUDIO_DIR = process.env.AUDIO_DIR || join(__dirname, 'audio');

// 确保音频目录存在
if (!existsSync(AUDIO_DIR)) {
  console.log(`[init] 创建音频目录: ${AUDIO_DIR}`);
  import('fs').then(({ mkdirSync }) => mkdirSync(AUDIO_DIR, { recursive: true }));
}

// ========== Express ==========
const app = express();
app.use(express.json());

// 静态文件服务（前端）
app.use(express.static(join(__dirname, 'public')));

// 支持的音频格式
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.webm', '.aac']);

// ========== 音频队列 ==========
// 简单队列：先进先出，正在播放的完成后自动取下一个
const queue = [];        // 待播放队列 [{filePath, fileName, id}]
let currentTrack = null; // 当前播放的音频
let playIdCounter = 0;

// 广播给所有 WebSocket 客户端
function broadcast(event, data) {
  const msg = JSON.stringify({ event, data });
  for (const ws of wss.clients) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

// 从队列取出下一首并通知前端
function playNext() {
  if (queue.length === 0) {
    currentTrack = null;
    return;
  }
  const track = queue.shift();
  currentTrack = track;
  // 通过 WebSocket 通知前端播放
  broadcast('play', {
    id: track.id,
    fileName: track.fileName,
    url: `/audio/${encodeURIComponent(track.fileName)}`
  });
  console.log(`[play] #${track.id} ${track.fileName} (队列剩余: ${queue.length})`);
}

// POST /api/play — 添加音频到队列
// Body: { "path": "相对路径或绝对路径" } 或 { "filePath": "..." }
// 也可通过 query ?path=xxx
app.post('/api/play', (req, res) => {
  let filePath = req.body?.path || req.body?.filePath || req.query?.path;
  if (!filePath) {
    return res.status(400).json({ error: '缺少 path 参数' });
  }

  // 支持绝对路径和相对于 AUDIO_DIR 的路径
  const resolved = filePath.startsWith('/') || filePath.match(/^[A-Za-z]:/)
    ? resolve(filePath)
    : resolve(AUDIO_DIR, filePath);

  if (!existsSync(resolved)) {
    return res.status(404).json({ error: `文件不存在: ${resolved}` });
  }
  if (!AUDIO_EXTS.has(extname(resolved).toLowerCase())) {
    return res.status(400).json({ error: `不支持的音频格式: ${extname(resolved)}` });
  }

  const track = {
    id: ++playIdCounter,
    filePath: resolved,
    fileName: basename(resolved),
  };

  // 如果当前没有在播放，直接播放；否则加入队列
  if (!currentTrack) {
    currentTrack = track;
    broadcast('play', {
      id: track.id,
      fileName: track.fileName,
      url: `/audio/${encodeURIComponent(track.fileName)}`
    });
    console.log(`[play] #${track.id} ${track.fileName}`);
  } else {
    queue.push(track);
    console.log(`[queue] #${track.id} ${track.fileName} (队列: ${queue.length})`);
    broadcast('queued', { id: track.id, fileName: track.fileName, position: queue.length });
  }

  res.json({ ok: true, id: track.id, fileName: track.fileName, queued: !!currentTrack && currentTrack.id !== track.id });
});

// POST /api/skip — 跳过当前，播放下一首
app.post('/api/skip', (req, res) => {
  currentTrack = null;
  playNext();
  res.json({ ok: true });
});

// POST /api/clear — 清空队列（当前正在播放的不中断）
app.post('/api/clear', (req, res) => {
  queue.length = 0;
  broadcast('cleared', {});
  res.json({ ok: true });
});

// GET /api/status — 查看队列状态
app.get('/api/status', (req, res) => {
  res.json({
    current: currentTrack ? { id: currentTrack.id, fileName: currentTrack.fileName } : null,
    queue: queue.map(t => ({ id: t.id, fileName: t.fileName })),
    total: queue.length + (currentTrack ? 1 : 0),
  });
});

// GET /audio/:filename — 提供音频文件访问（从 AUDIO_DIR）
app.get('/audio/:filename', (req, res) => {
  const filePath = resolve(AUDIO_DIR, req.params.filename);
  // 安全检查：防止路径穿越
  if (!filePath.startsWith(AUDIO_DIR)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.sendFile(filePath);
});

// ========== HTTP Server + WebSocket ==========
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('[ws] 客户端连接');
  // 如果当前有正在播放的音频，通知新客户端
  if (currentTrack) {
    ws.send(JSON.stringify({
      event: 'play',
      data: { id: currentTrack.id, fileName: currentTrack.fileName, url: `/audio/${encodeURIComponent(currentTrack.fileName)}` }
    }));
  }
  // 发送队列状态
  if (queue.length > 0) {
    ws.send(JSON.stringify({
      event: 'sync',
      data: { queue: queue.map(t => ({ id: t.id, fileName: t.fileName })) }
    }));
  }

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      // 前端报告播放结束，自动播放下一首
      if (msg.event === 'ended' && currentTrack && msg.data?.id === currentTrack.id) {
        console.log(`[ended] #${currentTrack.id} ${currentTrack.fileName}`);
        playNext();
      }
    } catch (e) { /* ignore bad messages */ }
  });

  ws.on('close', () => console.log('[ws] 客户端断开'));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[zdashboard] http://0.0.0.0:${PORT}`);
  console.log(`[zdashboard] 音频目录: ${AUDIO_DIR}`);
  console.log(`[zdashboard] POST /api/play {"path":"..."} 播放音频`);
});

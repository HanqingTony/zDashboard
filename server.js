import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join, resolve, basename, extname } from 'path';
import { existsSync, readdirSync, statSync, readFileSync } from 'fs';
import Database from 'better-sqlite3';

// ========== 配置 ==========
const __dirname = dirname(fileURLToPath(import.meta.url));

// 读取 config.json（不存在则用默认值）
// 配置项同时支持环境变量覆盖（优先级：环境变量 > config.json > 默认值）
let fileConfig = {};
const configPath = join(__dirname, 'config.json');
if (existsSync(configPath)) {
  try {
    fileConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
    console.log(`[config] 已加载: ${configPath}`);
  } catch (e) {
    console.warn(`[config] 读取失败，使用默认值: ${e.message}`);
  }
}

const PORT = process.env.PORT || fileConfig.port || 3100;
const HOST = process.env.HOST || fileConfig.host || '127.0.0.1';
const AUDIO_DIR = resolve(__dirname, process.env.AUDIO_DIR || fileConfig.audioDir || 'audio');
const DB_PATH = resolve(__dirname, process.env.DB_PATH || fileConfig.dbPath || 'zdb.db');

console.log(`[config] 监听: ${HOST}:${PORT}`);
console.log(`[config] 音频: ${AUDIO_DIR}`);
console.log(`[config] 数据库: ${DB_PATH}`);

// ========== SQLite 数据库 ==========
const db = new Database(DB_PATH);

// 开启 WAL 模式，提升并发读写性能
db.pragma('journal_mode = WAL');
// 外键支持（删除文章时级联清理关联数据）
db.pragma('foreign_keys = ON');

// ---------- 数据表初始化 ----------
// zVocab：单词学习状态表（全局，与文章无关）
db.exec(`
  CREATE TABLE IF NOT EXISTS zVocab (
    word        TEXT PRIMARY KEY,
    status      TEXT NOT NULL DEFAULT 'unknown',   -- mastered / familiar / unknown
    first_seen  TEXT,
    last_seen   TEXT,
    click_count INTEGER DEFAULT 0
  )
`);

// zArticles：保存学习过的文章
db.exec(`
  CREATE TABLE IF NOT EXISTS zArticles (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    title     TEXT,                                  -- 文章标题（自动提取或用户编辑）
    content   TEXT NOT NULL,                         -- 文章原文
    created   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )
`);

// zWordArticles：单词×文章关联表（N:M），记录每个单词在哪些文章中出现过
db.exec(`
  CREATE TABLE IF NOT EXISTS zWordArticles (
    word        TEXT NOT NULL,
    article_id  INTEGER NOT NULL,
    count       INTEGER DEFAULT 1,                   -- 在该文章中出现次数
    PRIMARY KEY (word, article_id),
    FOREIGN KEY (article_id) REFERENCES zArticles(id) ON DELETE CASCADE
  )
`);

console.log(`[db] 已连接: ${DB_PATH}`);
console.log(`[db] 表: zVocab, zArticles, zWordArticles`);

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

// ========== 英语学习模块 API ==========

// ---------- 分词工具 ----------
// 将英文文章拆分为单词数组（保留原始大小写，但去重时统一用小写比较）
function tokenize(text) {
  // 预处理：统一全角/弯引号撇号为半角，避免 don't 等被错误断词
  const normalized = text
    .replace(/[\u2019\u2018\u201A\uFF07]/g, "'")   // 右单引号、左单引号、单低引号、全角撇号 → 半角
    .replace(/[\u2013\u2014\u2010\uFF0D]/g, "-");  // en-dash、em-dash、hyphen、全角连字符 → 半角连字符

  // 匹配英文单词，支持：
  // - 撇号缩写：I'm, we'd, don't, it's
  // - 连字符复合词：good-looking, state-of-the-art, self-driving
  return normalized.match(/[a-zA-Z]+(?:['\-][a-zA-Z]+)*/g) || [];
}

// ---------- 文章相关 API ----------

// GET /api/articles — 获取所有文章列表
app.get('/api/articles', (req, res) => {
  const articles = db.prepare(
    `SELECT id, title, created,
            substr(content, 1, 100) AS excerpt,
            (SELECT COUNT(DISTINCT word) FROM zWordArticles WHERE article_id = zArticles.id) AS word_count
     FROM zArticles
     ORDER BY created DESC`
  ).all();
  res.json(articles);
});

// POST /api/articles — 保存新文章（同时建立单词关联）
// Body: { content: "文章文本", title?: "可选标题" }
app.post('/api/articles', (req, res) => {
  const { content, title } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: '文章内容不能为空' });
  }

  const now = new Date().toISOString();
  // 自动提取标题：取第一行非空文本，最多60字符，如未提供 title
  const articleTitle = title?.trim() ||
    content.split('\n').find(l => l.trim())?.trim().slice(0, 60) || '无标题';

  // 插入文章
  const result = db.prepare(
    'INSERT INTO zArticles (title, content, created) VALUES (?, ?, ?)'
  ).run(articleTitle, content, now);

  const articleId = result.lastInsertRowid;

  // 分词并统计词频
  const tokens = tokenize(content);
  const wordFreq = {};
  for (const word of tokens) {
    const key = word.toLowerCase();
    wordFreq[key] = (wordFreq[key] || 0) + 1;
  }

  // 批量写入 zWordArticles（单词-文章关联）
  const insertWordArticle = db.prepare(
    'INSERT OR REPLACE INTO zWordArticles (word, article_id, count) VALUES (?, ?, ?)'
  );
  // 批量更新 zVocab（首次见到的单词设为 unknown）
  const insertVocab = db.prepare(
    `INSERT INTO zVocab (word, status, first_seen, last_seen)
     VALUES (?, 'unknown', ?, ?)
     ON CONFLICT(word) DO UPDATE SET last_seen = excluded.last_seen`
  );

  const batch = db.transaction(() => {
    for (const [word, count] of Object.entries(wordFreq)) {
      insertWordArticle.run(word, articleId, count);
      insertVocab.run(word, now, now);
    }
  });
  batch();

  console.log(`[article] #${articleId} "${articleTitle}" (${Object.keys(wordFreq).length} 词)`);
  res.json({ ok: true, id: articleId, title: articleTitle, wordCount: Object.keys(wordFreq).length });
});

// GET /api/articles/:id — 获取单篇文章详情
app.get('/api/articles/:id', (req, res) => {
  const article = db.prepare('SELECT * FROM zArticles WHERE id = ?').get(req.params.id);
  if (!article) return res.status(404).json({ error: '文章不存在' });

  // 获取该文章所有单词的当前学习状态
  const words = db.prepare(
    `SELECT wa.word, wa.count, COALESCE(v.status, 'unknown') AS status
     FROM zWordArticles wa
     LEFT JOIN zVocab v ON wa.word = v.word
     WHERE wa.article_id = ?`
  ).all(req.params.id);

  res.json({ ...article, words });
});

// DELETE /api/articles/:id — 删除文章（级联删除 zWordArticles）
app.delete('/api/articles/:id', (req, res) => {
  const article = db.prepare('SELECT * FROM zArticles WHERE id = ?').get(req.params.id);
  if (!article) return res.status(404).json({ error: '文章不存在' });

  // 外键 CASCADE 自动清理 zWordArticles
  db.prepare('DELETE FROM zArticles WHERE id = ?').run(req.params.id);
  console.log(`[article] 已删除 #${article.id} "${article.title}"`);
  res.json({ ok: true });
});

// ---------- 单词状态 API ----------

// PUT /api/words — 更新单词学习状态（点击切换）
// Body: { word: "hello", status: "familiar" }
app.put('/api/words', (req, res) => {
  const { word, status } = req.body;
  if (!word || !['mastered', 'familiar', 'unknown'].includes(status)) {
    return res.status(400).json({ error: '无效参数，status 须为 mastered/familiar/unknown' });
  }

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO zVocab (word, status, first_seen, last_seen, click_count)
    VALUES (?, ?, ?, ?, 1)
    ON CONFLICT(word) DO UPDATE SET
      status = excluded.status,
      last_seen = excluded.last_seen,
      click_count = click_count + 1
  `).run(word, status, now, now);

  console.log(`[vocab] "${word}" → ${status}`);
  res.json({ ok: true, word, status });
});

// GET /api/words/:word/articles — 查询单词出现在哪些文章中
app.get('/api/words/:word/articles', (req, res) => {
  const word = decodeURIComponent(req.params.word).toLowerCase();
  const articles = db.prepare(`
    SELECT a.id, a.title, a.created, wa.count
    FROM zWordArticles wa
    JOIN zArticles a ON wa.article_id = a.id
    WHERE wa.word = ?
    ORDER BY a.created DESC
  `).all(word);

  // 附带当前学习状态
  const vocab = db.prepare('SELECT status, click_count FROM zVocab WHERE word = ?').get(word);
  res.json({ word, ...vocab, articles });
});

// GET /api/vocab/stats — 获取词汇统计概览
app.get('/api/vocab/stats', (req, res) => {
  const stats = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'mastered' THEN 1 ELSE 0 END) AS mastered,
      SUM(CASE WHEN status = 'familiar' THEN 1 ELSE 0 END) AS familiar,
      SUM(CASE WHEN status = 'unknown' THEN 1 ELSE 0 END) AS unknown
    FROM zVocab
  `).get();

  const articleCount = db.prepare('SELECT COUNT(*) AS c FROM zArticles').get().c;
  res.json({ ...stats, articles: articleCount });
});

// ========== 启动 ==========
server.listen(PORT, HOST, () => {
  console.log(`[zdashboard] http://${HOST}:${PORT}`);
  console.log(`[zdashboard] 音频目录: ${AUDIO_DIR}`);
  console.log(`[zdashboard] POST /api/play {"path":"..."} 播放音频`);
  console.log(`[zdashboard] 英语学习: /api/articles, /api/words, /api/vocab/stats`);
});

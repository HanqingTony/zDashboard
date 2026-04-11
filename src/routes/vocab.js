import { Router } from 'express';
import db from '../db.js';

const router = Router();

// PUT /api/words - update word learning status
router.put('/api/words', (req, res) => {
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
  // Force WAL checkpoint for single-file bind mount
  db.pragma('wal_checkpoint(TRUNCATE)');
  console.log(`[vocab] "${word}" → ${status}`);
  res.json({ ok: true, word, status });
});

// GET /api/words/:word/articles - word detail with articles
router.get('/api/words/:word/articles', (req, res) => {
  const word = decodeURIComponent(req.params.word).toLowerCase();
  const articles = db.prepare(`
    SELECT a.id, a.title, a.created, wa.count
    FROM zWordArticles wa
    JOIN zArticles a ON wa.article_id = a.id
    WHERE wa.word = ?
    ORDER BY a.created DESC
  `).all(word);
  const vocab = db.prepare('SELECT status, click_count FROM zVocab WHERE word = ?').get(word);
  res.json({ word, ...vocab, articles });
});

// GET /api/vocab/stats - vocab statistics
router.get('/api/vocab/stats', (req, res) => {
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

export { router as vocabRouter };

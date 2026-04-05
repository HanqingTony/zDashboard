import { Router } from 'express';
import db from '../db.js';

const router = Router();

// GET /api/articles - list articles
router.get('/api/articles', (req, res) => {
  const articles = db.prepare(
    'SELECT id, title, created, LENGTH(content) AS content_length FROM zArticles ORDER BY created DESC'
  ).all();
  res.json(articles);
});

// POST /api/articles - save article and extract words
router.post('/api/articles', (req, res) => {
  const { title, content } = req.body;
  if (!content) return res.status(400).json({ error: '缺少 content' });

  const now = new Date().toISOString();
  const articleTitle = title || content.substring(0, 50).replace(/\n/g, ' ');

  const result = db.prepare(
    'INSERT INTO zArticles (title, content, created) VALUES (?, ?, ?)'
  ).run(articleTitle, content, now);
  const articleId = result.lastInsertRowid;

  // Extract words
  const words = content.toLowerCase()
    .replace(/[^a-z\s'-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1);

  const wordCount = {};
  words.forEach(w => { wordCount[w] = (wordCount[w] || 0) + 1; });

  const insertWordArticle = db.prepare(
    'INSERT OR IGNORE INTO zWordArticles (word, article_id, count) VALUES (?, ?, ?)'
  );
  const insertVocab = db.prepare(
    'INSERT OR IGNORE INTO zVocab (word, status, first_seen, last_seen) VALUES (?, \'unknown\', ?, ?)'
  );

  const insertMany = db.transaction((entries) => {
    for (const [word, count] of entries) {
      insertWordArticle.run(word, articleId, count);
      insertVocab.run(word, now, now);
    }
  });
  insertMany(Object.entries(wordCount));

  console.log(`[article] 保存 #${articleId} "${articleTitle}" (${Object.keys(wordCount).length} 单词)`);
  res.json({ id: articleId, title: articleTitle, wordCount: Object.keys(wordCount).length });
});

// GET /api/articles/:id - get single article
router.get('/api/articles/:id', (req, res) => {
  const article = db.prepare('SELECT * FROM zArticles WHERE id = ?').get(req.params.id);
  if (!article) return res.status(404).json({ error: '文章不存在' });
  const words = db.prepare(
    'SELECT word, count FROM zWordArticles WHERE article_id = ? ORDER BY count DESC'
  ).all(req.params.id);
  res.json({ ...article, words });
});

// DELETE /api/articles/:id - delete article
router.delete('/api/articles/:id', (req, res) => {
  const article = db.prepare('SELECT * FROM zArticles WHERE id = ?').get(req.params.id);
  if (!article) return res.status(404).json({ error: '文章不存在' });
  db.prepare('DELETE FROM zArticles WHERE id = ?').run(req.params.id);
  console.log(`[article] 已删除 #${article.id} "${article.title}"`);
  res.json({ ok: true });
});

export { router as articlesRouter };

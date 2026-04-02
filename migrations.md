# zDashboard 数据库变更记录

> 本文件记录所有对 zdb.db 的 schema 变更 SQL，按版本归档。
> 每次新增/修改表结构时，在此追加记录并标注版本号。
> **仅追加，不修改历史记录。**

---

## v1.0.0 — 英语学习模块 (2026-04-03)

### 新增表：zVocab（单词学习状态）

```sql
-- 单词全局学习状态表，与文章无关
CREATE TABLE IF NOT EXISTS zVocab (
    word        TEXT PRIMARY KEY,                       -- 单词（小写）
    status      TEXT NOT NULL DEFAULT 'unknown',         -- mastered / familiar / unknown
    first_seen  TEXT,                                    -- 首次见到时间 (ISO 8601)
    last_seen   TEXT,                                    -- 最近见到时间 (ISO 8601)
    click_count INTEGER DEFAULT 0                        -- 点击次数（用于学习追踪）
);
```

### 新增表：zArticles（文章）

```sql
-- 保存学习过的文章
CREATE TABLE IF NOT EXISTS zArticles (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    title     TEXT,                                      -- 文章标题（自动提取首行或用户编辑）
    content   TEXT NOT NULL,                             -- 文章原文
    created   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
```

### 新增表：zWordArticles（单词×文章关联）

```sql
-- N:M 关联表，记录每个单词在哪些文章中出现过及出现次数
-- 删除文章时通过外键 CASCADE 自动清理关联记录
CREATE TABLE IF NOT EXISTS zWordArticles (
    word        TEXT NOT NULL,                           -- 单词（小写）
    article_id  INTEGER NOT NULL,                        -- 关联文章 ID
    count       INTEGER DEFAULT 1,                       -- 在该文章中出现次数
    PRIMARY KEY (word, article_id),
    FOREIGN KEY (article_id) REFERENCES zArticles(id) ON DELETE CASCADE
);
```

### SQLite 配置

```sql
-- WAL 模式：提升并发读写性能
PRAGMA journal_mode = WAL;

-- 启用外键约束（删除文章时级联清理 zWordArticles）
PRAGMA foreign_keys = ON;
```

---


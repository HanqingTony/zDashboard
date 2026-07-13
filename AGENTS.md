# AGENTS.md — zdashboard

## Tech Stack
- Backend: Node.js (ESM `"type": "module"`), Express 4.x, better-sqlite3, ws
- Frontend: single-file SPA at `public/index.html`, no build step, no bundler
- No tests, no lint, no typecheck configuration exists

## Commands
```bash
npm start          # node server.js
npm run dev        # node --watch server.js (auto-restart on changes)
```

## Environment Variables
Config is in `src/config.js` using `process.env.*` with defaults:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3100` | Server port |
| `HOST` | `127.0.0.1` | Bind address |
| `DB_PATH` | `./zdb.db` | SQLite database path |
| `AUDIO_DIR` | `./audio/` | Audio files directory |

For `.run` deployment, the deploy script uses different env names: `ZDB_PATH`, `ZAUDIO_DIR`, `ZDASHBOARD_PORT`.

## Database Conventions
- SQLite with WAL mode, `wal_autocheckpoint = 100`
- **Critical convention**: After every write transaction (insert/update/delete), code explicitly calls `db.pragma('wal_checkpoint(TRUNCATE)')`. This ensures the WAL is merged into the main `.db` file immediately — required for single-file bind mounts where `-wal`/`-shm` are not mapped to the host. Follow this pattern for all new write operations.
- Auto-create on first write (zVocab, zArticles are static tables — no migration system).

## Server Architecture
- Entry: `server.js` — sets up Express + WebSocket server on same HTTP port
- WebSocket: `/ws` broadcasts `play`/`status` events for the audio queue
- Graceful shutdown: `SIGINT`/`SIGTERM` → WAL checkpoint → close DB → exit
- `audioState` (queue, isPlaying, currentFile) is a mutable object shared between the audio router and server.js via import

## Routes
| File | Prefix | Purpose |
|------|--------|---------|
| `src/routes/audio.js` | `/api/audio`, `/api/play`, `/api/skip`, `/api/clear` | Audio file browser + playback queue |
| `src/routes/articles.js` | `/api/articles` | Article CRUD with word extraction |
| `src/routes/vocab.js` | `/api/words`, `/api/vocab/stats` | Word learning status management |

## Frontend Quirks
- Dual layout: portrait (`#scroller`) and landscape (`#landscape`) both exist in DOM, CSS toggles `display` via `@media (orientation: ...)`
- Many UI items (Projects, Tools) are hardcoded HTML, not data-driven
- Vocab app is the only functional tool; others are static placeholders

## Deploy
- Production: `bash deploy/build_run.sh` produces a self-contained `zbuild/zdashboard.run` binary (uses Docker + c2r)

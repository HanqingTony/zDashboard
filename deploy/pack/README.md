# zdashboard.run

Portable zDashboard - run as a single executable, no installation needed.

## Prerequisites

- Docker & Docker Compose installed
- zdb.db file (authoritative database)

## Environment Variables (Required)

| Variable | Description | Example |
|---|---|---|
| `ZDB_PATH` | Host path to zdb.db | `/home/tony/zdb.db` |
| `ZAUDIO_DIR` | Host path to audio directory | `/home/tony/zdashboard-audio` |
| `ZDASHBOARD_PORT` | Port to expose | `3100` |

## Usage

```bash
export ZDB_PATH=/home/tony/zdb.db
export ZAUDIO_DIR=/home/tony/zdashboard-audio
export ZDASHBOARD_PORT=3100
./zdashboard.run
```

## Behavior

- If container is already running: exits with info message
- If container is stopped: removes old container and starts fresh
- If image is not loaded: loads from bundled tar
- Audio directory is created automatically if not exists

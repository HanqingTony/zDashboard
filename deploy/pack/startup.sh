#!/bin/bash
# zdashboard.run - start zdashboard container
# Required env vars: ZDB_PATH, ZAUDIO_DIR, ZDASHBOARD_PORT

set -e

MISSING=0
for var in ZDB_PATH ZAUDIO_DIR ZDASHBOARD_PORT; do
    if [ -z "${!var}" ]; then
        echo "ERROR: $var is not set. Please export it before running."
        MISSING=1
    fi
done

if [ $MISSING -eq 1 ]; then
    echo ""
    echo "Usage:"
    echo "  export ZDB_PATH=/path/to/zdb.db"
    echo "  export ZAUDIO_DIR=/path/to/audio"
    echo "  export ZDASHBOARD_PORT=3100"
    echo "  ./zdashboard.run"
    exit 1
fi

# Validate that ZDB_PATH points to a file
if [ ! -f "$ZDB_PATH" ]; then
    echo "WARNING: ZDB_PATH=$ZDB_PATH does not exist. Container will create a new database."
fi

# Create audio dir if not exists
mkdir -p "$ZAUDIO_DIR"

# Kill and remove existing container if running
if docker ps --format '{{.Names}}' | grep -q '^zdashboard$'; then
    echo "Stopping running zdashboard container..."
    docker stop zdashboard >/dev/null
fi

if docker ps -a --format '{{.Names}}' | grep -q '^zdashboard$'; then
    echo "Removing old zdashboard container..."
    docker rm zdashboard >/dev/null
fi

# Load image if not present
if ! docker images zdashboard --format '{{.Repository}}' | grep -q '^zdashboard$'; then
    echo "Loading zdashboard image..."
    docker load -i zdashboard.tar
fi

# Start container
echo "Starting zdashboard on port $ZDASHBOARD_PORT..."
docker compose -f docker-compose.yml up -d

echo "Done. zdashboard is running at http://localhost:$ZDASHBOARD_PORT"

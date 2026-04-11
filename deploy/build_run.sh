#!/bin/bash
# build_run.sh - Build zdashboard.run using c2r
# Usage: bash deploy/build_run.sh
# Output: zbuild/zdashboard.run

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$PROJECT_DIR/zbuild"
C2R="${C2R:-$(command -v c2r 2>/dev/null || echo "$HOME/zprojects/container2run/c2r.sh")}"

echo "=== zDashboard .run Builder (c2r) ==="

# Step 1: Build Docker image
echo "[1/3] Building Docker image..."
docker build -f "$SCRIPT_DIR/Dockerfile" -t zdashboard:latest "$PROJECT_DIR"

# Step 2: Package with c2r (daemon mode for long-running service)
echo "[2/3] Packaging with c2r..."
mkdir -p "$BUILD_DIR"
bash "$C2R" build -f "$SCRIPT_DIR/docker-compose.yml" -o "$BUILD_DIR/zdashboard.run" -d

# Step 3: Summary
echo ""
echo "=== Build Complete ==="
ls -lh "$BUILD_DIR/zdashboard.run"
echo ""
echo "Run it with:"
echo "  export ZDB_PATH=/path/to/zdb.db"
echo "  export ZAUDIO_DIR=/path/to/audio"
echo "  export ZDASHBOARD_PORT=3100"
echo "  ./zbuild/zdashboard.run"

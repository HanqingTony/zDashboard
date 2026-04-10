#!/bin/bash
# build_run.sh - Build zdashboard.run portable executable
# Usage: bash deploy/build_run.sh
# Output: zbuild/ directory with all build artifacts

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$PROJECT_DIR/zbuild"
PACK_DIR="$BUILD_DIR/pack"

echo "=== zDashboard .run Builder ==="
echo "Project: $PROJECT_DIR"
echo "Output:  $BUILD_DIR"
echo ""

# Step 1: Clean and create build directory
rm -rf "$BUILD_DIR"
mkdir -p "$PACK_DIR"

# Step 2: Build Docker image
echo "[1/5] Building Docker image..."
docker build -f "$SCRIPT_DIR/Dockerfile" -t zdashboard:latest "$PROJECT_DIR"

# Step 3: Export image to tar
echo "[2/5] Exporting Docker image..."
docker save zdashboard:latest -o "$PACK_DIR/zdashboard.tar"

# Step 4: Copy pack files
echo "[3/5] Copying pack files..."
cp "$SCRIPT_DIR/pack/docker-compose.yml" "$PACK_DIR/"
cp "$SCRIPT_DIR/pack/startup.sh" "$PACK_DIR/"
chmod +x "$PACK_DIR/startup.sh"

# Step 5: Generate VERSION
echo "[4/5] Generating VERSION..."
GIT_HASH=$(cd "$PROJECT_DIR" && git rev-parse --short HEAD)
BUILD_DATE=$(date +%Y-%m-%d_%H%M%S)
cat > "$PACK_DIR/VERSION" << EOF
name=zdashboard
image=zdashboard:latest
git_commit=${GIT_HASH}
build_date=${BUILD_DATE}
EOF

# Copy README
cp "$SCRIPT_DIR/pack/README.md" "$PACK_DIR/"

# Step 6: Package with makeself
echo "[5/5] Packaging with makeself..."
makeself "$PACK_DIR" "$BUILD_DIR/zdashboard.run" "zdashboard - portable web dashboard" ./startup.sh

# Summary
echo ""
echo "=== Build Complete ==="
echo "Artifacts in $BUILD_DIR/:"
ls -lh "$BUILD_DIR/"
echo ""
echo "Pack contents in $BUILD_DIR/pack/:"
ls -lh "$PACK_DIR/"
echo ""
echo "Run it with:"
echo "  export ZDB_PATH=/path/to/zdb.db"
echo "  export ZAUDIO_DIR=/path/to/audio"
echo "  export ZDASHBOARD_PORT=3100"
echo "  ./zbuild/zdashboard.run"

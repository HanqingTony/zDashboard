#!/bin/bash
# start.sh - Start zDashboard from anywhere
# Usage: ./start.sh (or bash /path/to/zdashboard/start.sh)

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
node server.js

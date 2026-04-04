# zDashboard Dockerfile
FROM node:20-alpine

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy application code
COPY server.js ./
COPY public/ ./public/

# Create data directories
RUN mkdir -p /app/audio

EXPOSE 3100

CMD ["node", "server.js"]

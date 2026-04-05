FROM node:20-alpine

# Build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy application code
COPY server.js ./
COPY src/ ./src/
COPY public/ ./public/

EXPOSE 3100

CMD ["node", "server.js"]

# zDashboard Dockerfile
FROM node:20-alpine

WORKDIR /app

# Clone from GitHub (use branch arg, default main)
ARG BRANCH=main
RUN apk add --no-cache git && \
    git clone --depth 1 --branch $BRANCH https://github.com/HanqingTony/zDashboard.git . && \
    apk del git

# Install production dependencies only
RUN npm ci --omit=dev

# Create data directories
RUN mkdir -p /app/audio

EXPOSE 3100

CMD ["node", "server.js"]

# SafeTube parent server — production-ready container.
FROM node:20-alpine

WORKDIR /app

# Install dependencies first (better layer caching).
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Copy the app. The SQLite DB lives on a volume (see below), never in the image.
COPY server.js .env.example ./
COPY src/ ./src/
COPY public/ ./public/

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/data/safetube.db

VOLUME /data
EXPOSE 3000

# FAMILY_KEY is required — pass it at runtime:  -e FAMILY_KEY=...
CMD ["node", "server.js"]

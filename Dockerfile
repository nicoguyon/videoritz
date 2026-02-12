FROM node:20-slim AS base

# Install FFmpeg
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

# --- Build stage ---
FROM base AS builder
WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Runtime stage ---
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Copy standalone output — nested under build dir name
COPY --from=builder /build/.next/standalone/build ./
COPY --from=builder /build/.next/static ./.next/static
COPY --from=builder /build/public ./public

EXPOSE 3000

CMD ["node", "server.js"]

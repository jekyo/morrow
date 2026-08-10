FROM node:22-bookworm-slim AS base

# Firefox/Camoufox runtime libs + Xvfb (per-profile displays in Plan 2) + curl for probes
# python3/make/g++ are needed by node-gyp to build the better-sqlite3 native addon
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb x11-utils curl ca-certificates \
    python3 make g++ \
    libgtk-3-0 libdbus-glib-1-2 libasound2 libx11-xcb1 libxtst6 \
    libxrandr2 libpangocairo-1.0-0 libatk1.0-0 libcairo-gobject2 \
    libgdk-pixbuf-2.0-0 libxcomposite1 libxcursor1 libxdamage1 libxi6 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Download the Camoufox browser into the image
RUN npx camoufox-js fetch

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV MORROW_DATA_DIR=/data
VOLUME /data
EXPOSE 3000

CMD ["node_modules/.bin/tsx", "src/server/index.ts"]

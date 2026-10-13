FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=3000 DATA_DIR=/app/data
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node *.mjs ./
COPY --chown=node:node public ./public
RUN node --check server.mjs && node --check settings-store.mjs && node --check inbox.mjs && node --check ai.mjs && test -f public/email-design.js && mkdir /app/data && chown node:node /app/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD curl --fail --silent http://127.0.0.1:${PORT:-3000}/health || exit 1
CMD ["node", "server.mjs"]

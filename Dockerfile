FROM node:22-alpine

WORKDIR /app

COPY package.json index.html app.js technician.js worker.js seed-orders.js portal-client.js portal-data.js auth-data.js routes.js location-assist.js notification-center.js reset-users.mjs backup-data.js styles.css support.html support.js server.js ./
COPY public/assets ./public/assets

RUN mkdir -p /app/.data && chown node:node /app/.data
USER node

ENV HOST=0.0.0.0 PORT=4173 SUPPORT_TOKEN_FILE=/app/.data/support-token
EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- --header='X-Forwarded-Proto: https' http://127.0.0.1:4173/ >/dev/null || exit 1

CMD ["node", "server.js"]

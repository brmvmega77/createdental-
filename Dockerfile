FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json owner.html owner.js owner.css owner-api.js owner-metrics.js owner-store.js create-owner-account.mjs company-pulse.js order-list-utils.js production-stages.js tasks.js cam-workflow.js order-print.js orders-overrides.css index.html landing.html landing.css landing.js app.js technician.js worker.js seed-orders.js portal-client.js portal-data.js auth-data.js routes.js location-assist.js notification-center.js reset-users.mjs backup-data.js telegram-bot.js employee-telegram-bot.js theme.js work-catalog.js yandex-disk-storage.js large-upload.html large-upload.js cad-preview.html styles.css support.html support.js server.js yandex_a7db0249ed96373e.html ./
COPY public/assets ./public/assets

RUN npm ci --omit=dev && mkdir -p /app/.data && chown node:node /app/.data
USER node

ENV HOST=0.0.0.0 PORT=4173 SUPPORT_TOKEN_FILE=/app/.data/support-token
EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- --header='X-Forwarded-Proto: https' http://127.0.0.1:4173/ >/dev/null || exit 1

CMD ["node", "server.js"]

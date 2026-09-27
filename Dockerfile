# MBG-BIOLOOP AI untuk server sendiri / VPS
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY lib ./lib
COPY api ./api
COPY server ./server
COPY public ./public
COPY firmware ./firmware
ENV NODE_ENV=production PORT=3000 DATA_DIR=/app/data
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:3000/api/health >/dev/null || exit 1
CMD ["node", "server/index.js"]

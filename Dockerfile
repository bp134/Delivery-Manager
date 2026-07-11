FROM node:20-slim

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js config.js zones.json ./
COPY lib ./lib
COPY public ./public
COPY migrations ./migrations

CMD ["node", "server.js"]

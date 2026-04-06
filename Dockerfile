# ─── Stage 1: Build client ────────────────────────────────────
FROM node:20-alpine AS client-build

ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci

COPY client/ ./
COPY shared/ ../shared/
RUN npm run build

# ─── Stage 2: Build server ────────────────────────────────────
FROM node:20-alpine AS server-build

WORKDIR /app
COPY server/package*.json ./server/
COPY shared/ ./shared/
RUN cd server && npm ci

COPY server/ ./server/
RUN cd server && npx tsc

# ─── Stage 3: Production image ────────────────────────────────
FROM node:20-alpine AS production

# better-sqlite3 necessita build tools per compilar
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copiar server dependencies i codi compilat
COPY server/package*.json ./
RUN npm ci --omit=dev && apk del python3 make g++

COPY --from=server-build /app/server/dist/ ./dist/
# El servidor espera client/dist relatiu a __dirname (dist/server/src/../../client/dist = dist/client/dist)
COPY --from=client-build /app/client/dist/ ./dist/client/dist/

# Crear directori de dades persistent
RUN mkdir -p data

# Variables d'entorn per defecte
ENV NODE_ENV=production
ENV PORT=3001
ENV DB_PATH=/app/data/alerta-desnona.db

# Exposar port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

# Executar
CMD ["node", "dist/server/src/index.js"]

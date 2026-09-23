# syntax=docker/dockerfile:1
# Build context: repository root (npm workspaces). Build with:
#   docker build -f backend/Dockerfile .

# ---- Stage 1: install all dependencies and compile TypeScript ----
FROM node:22-alpine AS build
WORKDIR /app
# Every workspace manifest is copied so `npm ci` matches package-lock.json;
# only the shared and backend workspaces are actually installed.
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY e2e/package.json e2e/
RUN npm ci -w shared -w backend --no-audit --no-fund
COPY shared/ shared/
COPY backend/ backend/
RUN npm run build -w shared && npm run build -w backend

# ---- Stage 2: production image with runtime dependencies only ----
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY e2e/package.json e2e/
RUN npm ci -w backend --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/backend/dist backend/dist
# Unprivileged user provided by the official Node.js image.
USER node
EXPOSE 3000
CMD ["node", "backend/dist/server.js"]

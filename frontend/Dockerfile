# syntax=docker/dockerfile:1
# Build context: repository root (npm workspaces). Build with:
#   docker build -f frontend/Dockerfile .

# ---- Stage 1: build the static Vite bundle ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY e2e/package.json e2e/
RUN npm ci -w shared -w frontend --no-audit --no-fund
COPY shared/ shared/
COPY frontend/ frontend/
RUN npm run build -w shared && npm run build -w frontend

# ---- Stage 2: serve the bundle with an unprivileged nginx (port 8080) ----
FROM nginxinc/nginx-unprivileged:alpine AS runtime
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 8080

# syntax=docker/dockerfile:1

# Build from the repository root: docker build -f programs/goho-server/Dockerfile .
FROM node:24-bookworm-slim AS base
# Keep in sync with packageManager in the root package.json.
RUN npm install --global pnpm@12.8.1 && npm cache clean --force
WORKDIR /app

FROM base AS install
COPY . .
RUN pnpm install --frozen-lockfile --prod --filter "@goho/goho-server..."

FROM node:24-bookworm-slim
LABEL org.opencontainers.image.title="goho-server"
LABEL org.opencontainers.image.source="https://github.com/adamaho/goho"
ENV NODE_ENV=production \
    GOHO_SERVER_HOST=0.0.0.0 \
    GOHO_SERVER_PORT=13000
COPY --from=install /app /app
WORKDIR /app/programs/goho-server
USER node
EXPOSE 13000
# Migrations finish before the server starts, as in the systemd unit.
CMD ["sh", "-c", "node src/database/migrate.ts && exec node src/main.ts"]

# syntax=docker/dockerfile:1

# Build from the repository root: docker build -f programs/goho-mcp/Dockerfile .
FROM node:26.13.0-bookworm-slim AS base
# Keep in sync with packageManager in the root package.json.
RUN npm install --global pnpm@12.18.0 && npm cache clean --force
WORKDIR /app

FROM base AS pruner
COPY . .
# Keep in sync with the turbo version in the pnpm catalog.
RUN pnpm dlx turbo@2.11.10 prune @goho/goho-mcp --docker

FROM base AS installer
# Dependency manifests only, so this layer is reused until dependencies change.
COPY --from=pruner /app/out/json/ ./
# turbo prune omits the pnpmfile, but the lockfile checksums its hooks.
COPY --from=pruner /app/.pnpmfile.cjs ./
RUN pnpm install --frozen-lockfile --prod --filter "@goho/goho-mcp..."
COPY --from=pruner /app/out/full/ ./

FROM node:26.13.0-bookworm-slim
LABEL org.opencontainers.image.title="goho-mcp"
LABEL org.opencontainers.image.source="https://github.com/adamaho/goho"
ENV NODE_ENV=production \
    GOHO_MCP_HOST=0.0.0.0 \
    GOHO_MCP_PORT=13001
COPY --from=installer /app /app
WORKDIR /app/programs/goho-mcp
USER node
EXPOSE 13001
CMD ["node", "src/main.ts"]

# syntax=docker/dockerfile:1
# Build context is repository root. A committed API lock is mandatory.
# This is a transport-only candidate; not an approved production business runtime.
FROM node:24-bookworm-slim AS build
WORKDIR /workspace
COPY package.json package-lock.json ./
RUN npm ci
COPY apps/api/package.json apps/api/package-lock.json ./apps/api/
RUN npm ci --prefix apps/api
COPY . .
RUN npm run --prefix apps/api verify:platform
RUN npm prune --omit=dev && npm prune --prefix apps/api --omit=dev

FROM node:24-bookworm-slim AS runtime
WORKDIR /workspace
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=3001 API_DOCS=0 API_CANONICAL_READS=0 API_CANONICAL_WRITES=0
COPY --from=build --chown=node:node /workspace/package.json ./package.json
COPY --from=build --chown=node:node /workspace/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /workspace/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=node:node /workspace/apps/api/dist ./apps/api/dist
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3001/api/v1/health/live').then(r=>{if(!r.ok)process.exitCode=1}).catch(()=>{process.exitCode=1})"]
CMD ["node", "apps/api/dist/main.js"]

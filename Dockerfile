# Multi-stage Dockerfile: base -> development -> builder -> production

# 1. Base stage: shared Node 24 slim runtime and working directory
FROM node:24-slim AS base
WORKDIR /app

# 2. Development stage: all dependencies, non-root user, hot-reload dev server
FROM base AS development
COPY --chown=node:node package*.json ./
RUN npm ci && chown -R node:node /app
COPY --chown=node:node . .
USER node
EXPOSE 3000
CMD ["npm", "run", "dev"]

# 3. Builder stage: compile TypeScript to dist/ and prune devDependencies
FROM base AS builder
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json ./
COPY src/ ./src/
COPY migrations/ ./migrations/
RUN npm run build
RUN npm prune --omit=dev

# 4. Production stage: minimal runtime, compiled code, non-root, production dependencies only
FROM base AS production
ENV NODE_ENV=production
WORKDIR /app

COPY --chown=node:node package.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist

USER node
EXPOSE 3000

CMD ["node", "dist/server.js"]

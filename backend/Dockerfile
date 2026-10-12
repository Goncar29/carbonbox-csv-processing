# One image for both ECS services: the API (default CMD) and the worker
# (override the command with: node dist/workers/index.js).

# ---- build: compile TypeScript and generate the Prisma client ----
FROM node:24-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
# The postinstall script runs `prisma generate`, so the schema must be there before `npm ci`.
COPY src/document-processing/infrastructure/persistence/models ./src/document-processing/infrastructure/persistence/models
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build
# Keep the Prisma CLI out of the runtime image; the generated client stays in node_modules/.prisma.
RUN npm prune --omit=dev

# ---- runtime: only compiled code and production dependencies ----
FROM node:24-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# Migrations are applied by a one-off task in the deploy pipeline (prisma migrate deploy), not at startup.
COPY --from=build /app/src/document-processing/infrastructure/persistence/models ./prisma
USER node
EXPOSE 3001
CMD ["node", "dist/main/index.js"]

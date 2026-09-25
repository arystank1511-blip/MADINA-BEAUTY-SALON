FROM node:24.15.0-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@10.30.3
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm db:generate && pnpm --filter @forma/api build
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/src/main.js"]

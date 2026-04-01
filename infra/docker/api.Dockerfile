FROM node:24-alpine AS deps
WORKDIR /app
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true

COPY package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm install --no-audit --no-fund

FROM node:24-alpine AS builder
WORKDIR /app
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pharmahub?schema=public

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN node_modules/.bin/prisma generate --schema packages/database/prisma/schema.prisma
RUN npm run build --workspace @pharmahub/shared
RUN npm run build --workspace @pharmahub/api

FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV API_PORT=4000

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api ./apps/api
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/packages/database/prisma ./packages/database/prisma

EXPOSE 4000

CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy --config prisma.config.ts && node apps/api/dist/main.js"]

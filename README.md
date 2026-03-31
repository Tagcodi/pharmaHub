# PharmaHub

PharmaHub is an offline-friendly pharmacy management platform designed for Ethiopian pharmacies. It is being built as an open-source, Docker-deployable product with a path for both community self-hosting and a paid managed SaaS offering.

## Why PharmaHub

The MVP is focused on the problems pharmacies feel every day:

- inaccurate manual inventory tracking
- medicine theft and unexplained stock loss
- expired medicine waste
- slow sales workflows at the counter
- weak owner visibility into daily operations

PharmaHub is designed to solve those problems with a practical desktop web app, a traceable stock ledger, and a deployment model that works for both local self-hosting and commercial hosting.

## What Is In This Repository

This repository currently contains the first technical foundation for the product:

- product definition and MVP workflow
- v1 scope and architecture documents
- initial Prisma data model for the pharmacy domain
- monorepo scaffold for web, API, shared code, and database
- Docker Compose setup for local development and deployment

## Codebase Overview

```text
apps/
  api/        NestJS backend API
  web/        Next.js desktop web application
packages/
  database/   Prisma schema and database scripts
  shared/     Shared constants, enums, and types
infra/
  docker/     Dockerfiles for the app services
```

### Current Modules

- `apps/web`
  The desktop-first frontend shell for PharmaHub.

- `apps/api`
  The NestJS backend that will own authentication, inventory, sales, adjustments, and audit logic.

- `packages/database`
  The Prisma schema that models pharmacies, branches, users, medicines, stock batches, sales, adjustments, stock movements, and audit logs.

- `packages/shared`
  Shared application constants and domain enums used across services.

## Product Documents

- [MVP.md](./MVP.md)
- [PRODUCT_SCOPE.md](./PRODUCT_SCOPE.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)
- [gitstratigies.md](./gitstratigies.md)

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Create your environment file

```bash
cp .env.example .env
```

### 3. Start PostgreSQL and Redis

```bash
docker compose up -d postgres redis
```

### 4. Generate Prisma client

```bash
DATABASE_URL='postgresql://postgres:postgres@localhost:5432/pharmahub?schema=public' npm run prisma:generate
```

### 5. Run the backend API

```bash
npm run dev:api
```

### 6. Run the web app

```bash
npm run dev:web
```

The web app runs on `http://localhost:3000` and the API health endpoint is available at `http://localhost:4000/health`.

## Docker Usage

Run the whole stack with Docker:

```bash
docker compose up --build
```

## Useful Commands

```bash
npm run dev:web
npm run dev:api
npm run typecheck
npm run build
npm run prisma:generate
npm run prisma:migrate:dev
```

## Recommended Build Order

1. Implement pharmacy, branch, and user onboarding.
2. Add authentication and role-based access control.
3. Build medicines, stock batches, and the stock movement ledger.
4. Build sales and inventory adjustments.
5. Add audit logs, alerts, and dashboard summaries.
6. Add richer reporting and deployment hardening.

## Open-Source And Commercial Direction

The intended product model is:

- open-source core for self-hosting
- paid managed cloud hosting
- paid onboarding, migration, backup, support, and enterprise services

The recommended license direction for the public core is `AGPL-3.0`, though the final license decision should be made before the public launch.

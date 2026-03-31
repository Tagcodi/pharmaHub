# PharmaHub Architecture

## Architecture Goals

- Keep the system simple enough for a fast MVP
- Support self-hosting and paid managed hosting
- Design for unreliable internet connectivity
- Keep auditability and stock traceability at the center

## Core Stack

- Frontend: Next.js desktop web app
- Backend: NestJS API
- Database: PostgreSQL
- Cache and background jobs: Redis
- ORM and schema: Prisma
- Containers: Docker and Docker Compose
- Monorepo: npm workspaces

## Service Layout

### Web

- Provides the staff-facing desktop application
- Will host inventory, sales, alerts, reports, and admin screens
- Talks to the API over HTTP

### API

- Exposes authenticated business endpoints
- Owns domain logic for stock movement, sales, audit logs, and reporting
- Connects to PostgreSQL and Redis

### Database

- Stores pharmacies, branches, users, medicines, batches, sales, movements, and audits
- Maintains a durable operational history for accountability

### Redis

- Supports background jobs, caches, and future sync queues

## Monorepo Structure

```text
apps/
  web/
  api/
packages/
  shared/
  database/
infra/
  docker/
```

## Domain Design Principles

### 1. Stock Movement Is The Source Of Truth

Every stock change must produce a movement record. Inventory should never change silently.

### 2. Batch-Aware Inventory

Medicines should be tracked by batch and expiry, not only by total quantity.

### 3. Audit Logs For Sensitive Actions

Authentication events, adjustments, user changes, and high-risk operations should be auditable.

### 4. Single Branch First, Multi-Branch Ready

The initial product assumes one branch, but the schema includes branch references so the SaaS product can grow without a painful redesign.

### 5. Offline-Friendly By Design

The system should tolerate connectivity interruptions by keeping workflows deterministic and syncable.

## Early Build Phases

### Phase 1

- Authentication
- Role-based access
- Medicines
- Stock batches
- Stock movements

### Phase 2

- Sales
- Adjustments
- Audit logging
- Alerts

### Phase 3

- Dashboard summaries
- Reports
- Hosted deployment hardening

## Deployment Model

### Community Edition

- Self-hosted with Docker Compose
- Open-source core

### Paid Managed Edition

- Same core application
- Hosted by the PharmaHub team
- Paid support, backups, onboarding, and SLA options

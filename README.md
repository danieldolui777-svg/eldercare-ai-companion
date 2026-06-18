# Eldercare AI Companion

AI voice companion for elderly care — backend foundation (Milestone 1).

## Prerequisites

- Node.js 20 LTS
- pnpm 9+
- Docker Desktop

## Local setup

```bash
# 1. Install dependencies
pnpm install

# 2. Start PostgreSQL
docker compose up -d

# 3. Copy env file
cp apps/api/.env.example apps/api/.env

# 4. Run migrations
pnpm --filter @eldercare/api exec prisma migrate dev --name init

# 5. Seed database
pnpm --filter @eldercare/api exec prisma db seed

# 6. Start API
pnpm --filter @eldercare/api dev
```

API runs at `http://localhost:3000/api/v1`

## Run tests

```bash
pnpm --filter @eldercare/api test
```

## Key endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/residents | List residents |
| POST | /api/v1/residents | Create resident |
| GET | /api/v1/residents/:id/medications | List medications |
| POST | /api/v1/medications | Create medication |
| POST | /api/v1/medication-schedules | Create schedule |
| GET | /api/v1/residents/:id/reminders | List reminder events |
| POST | /api/v1/reminder-events/:id/confirm | Confirm reminder |
| POST | /api/v1/voice-events/confirm | Mock voice confirmation |
| GET | /api/v1/alerts | Active alerts |
| POST | /api/v1/alerts/:id/acknowledge | Acknowledge alert |
| POST | /api/v1/alerts/:id/resolve | Resolve alert |
| GET | /api/v1/caregivers | List caregivers |

## Architecture

```
packages/domain     — Zod schemas and types (shared)
packages/config     — Env validation
apps/api            — NestJS + Fastify backend
  prisma/           — Schema, migrations, seed
  src/
    resident/       — Resident CRUD
    caregiver/      — Caregiver CRUD
    medication/     — Medication + schedule CRUD
    reminder/       — Reminder events + confirmation logic
    alert/          — Alert creation and lifecycle
    audit/          — Immutable audit log (global)
    prisma/         — PrismaService (global)
    common/         — ZodPipe
```

## Safety constraints

- `dosageLabel` is display-only — never computed or modified by the AI.
- Audit logs have no DELETE endpoint and are never soft-deleted.
- No AI provider is integrated in Milestone 1.
- Alerts are always created when medication status is `confirmed_not_taken`, `unknown`, or `missed`.

## Next milestone

Phase 2: reminder scheduler (cron-based event generation + auto-miss detection).

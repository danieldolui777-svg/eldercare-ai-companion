# CLAUDE.md — Project Instructions for Claude Code

## Project context

This repository is for an AI voice companion for elderly care. The initial market is retirement homes, assisted-living facilities, and family-supported home care.

The product is a companion and reminder assistant, not a doctor, nurse, certified medical device, or emergency service.

The system should be designed as:

> Always-on locally, AI-on only when useful.

Local software should handle wake word, VAD, emergency phrase detection placeholders, scheduled reminders, and basic deterministic flows. Cloud AI should be activated only when needed for conversation, flexible understanding, or escalation support.

## Non-negotiable safety constraints

Never implement features that allow the AI to:

- diagnose medical conditions;
- recommend or modify medication dosage;
- change a treatment plan;
- suppress emergency-like alerts;
- delete audit logs;
- silently record all conversations by default;
- expose full medical records to an LLM without strict tool-based access control.

Medication logic must be deterministic and auditable. The AI may help with natural-language interaction, but the backend must own the source of truth.

## Engineering priorities

Prioritize, in order:

1. Safety and auditability.
2. Clear domain model.
3. Testability.
4. Simple architecture.
5. Provider-agnostic AI integration.
6. Cost control.
7. UX quality.

Do not over-engineer early prototypes. However, do not cut corners on safety, audit logs, or data boundaries.

## Preferred stack

Use TypeScript where practical.

Preferred initial monorepo:

```text
apps/
  api/              # Backend API
  dashboard/        # Caregiver/family dashboard
  device-web/       # Early voice/device prototype
packages/
  domain/           # Shared domain types and validation
  ai-providers/     # OpenAI/Claude/Grok abstractions
  config/           # Shared config
  testing/          # Test utilities
docs/
  architecture.md
  safety.md
  api.md
```

Preferred backend:

- Node.js LTS
- TypeScript
- NestJS or Fastify
- PostgreSQL
- Prisma ORM
- Zod validation
- Vitest/Jest for tests

Preferred frontend:

- Next.js for dashboard
- React or React Native for device prototype

## Work style

Before writing code for large tasks:

1. Inspect the repo.
2. Summarize the current state.
3. Propose a small implementation plan.
4. Make minimal, reviewable changes.
5. Run relevant tests or explain why tests were not run.
6. Update docs when behavior changes.

Do not generate a massive application in one step. Build vertical slices.

## First milestone

The first milestone is backend foundation, not voice AI.

Implement:

- Resident model.
- Caregiver model.
- Medication model.
- MedicationSchedule model.
- ReminderEvent model.
- Alert model.
- AuditLog model.
- CRUD APIs where appropriate.
- Reminder confirmation flow.
- Alert creation on missed/unknown medication confirmation.
- Unit tests.
- Seed data.

## AI provider design

Implement provider interfaces first. Do not hard-code the codebase to one vendor.

Suggested interfaces:

```ts
interface VoiceProvider {
  startSession(input: StartVoiceSessionInput): Promise<VoiceSession>;
  endSession(sessionId: string): Promise<void>;
}

interface TextLLMProvider {
  generateDailySummary(input: DailySummaryInput): Promise<DailySummary>;
  classifyConversationRisk(input: RiskClassificationInput): Promise<RiskClassification>;
}
```

OpenAI Realtime can be the first voice provider, but it must sit behind an abstraction.

## Data boundaries

Keep these separate:

- medical/reminder data;
- conversation memory;
- audit logs;
- caregiver/family notification data;
- raw audio/transcripts, if stored at all.

Default design should avoid storing raw audio unless explicitly enabled with consent.

## Definition of done

A task is done only when:

- code compiles;
- relevant tests pass or missing tests are explicitly documented;
- database schema changes include migrations;
- safety-sensitive behavior is covered by tests;
- public behavior is documented;
- no secrets are committed.


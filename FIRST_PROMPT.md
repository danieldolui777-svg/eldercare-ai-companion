# First Prompt to Use in Claude Code or Codex

Use this prompt after creating the repo and placing `PROJECT_SPEC.md`, `CLAUDE.md`, and/or `AGENTS.md` at the repository root.

```text
Read PROJECT_SPEC.md and the repository instruction file.

Do not write code yet.

First, produce a concise implementation plan for Milestone 1:
- TypeScript monorepo structure
- backend API choice
- database schema approach
- test strategy
- local development commands
- first vertical slice

Then wait for my approval before creating files.

Important constraints:
- medication logic must be deterministic
- the AI must not make medical decisions
- audit logs are mandatory
- AI provider code must be abstracted
- do not integrate OpenAI Realtime yet
```

After approving the plan, use this second prompt:

```text
Implement Milestone 1 only.

Create the initial monorepo with:
- apps/api
- packages/domain
- packages/config
- docs

Implement:
- Resident model
- Medication model
- MedicationSchedule model
- ReminderEvent model
- Alert model
- AuditLog model
- basic API endpoints
- reminder confirmation service
- alert creation when medication status is unknown, not taken, or missed
- unit tests for reminder confirmation and alert creation
- Docker Compose with PostgreSQL
- README with local setup commands

Do not implement real voice AI yet. Add only a mock voice event endpoint if needed.
```

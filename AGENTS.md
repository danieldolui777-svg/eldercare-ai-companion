# AGENTS.md — Codex Instructions

## Project summary

This repo builds an AI voice companion for elderly care. It is initially focused on retirement homes and family-supported elder care.

The app provides:

- voice conversation;
- medication reminders;
- reminder confirmation logging;
- caregiver alerts;
- caregiver/family dashboard;
- conversation memory;
- provider-agnostic AI integration.

It is not a doctor, nurse, certified emergency service, or medical decision system.

## Hard rules

Do not implement AI behavior that:

- diagnoses medical conditions;
- recommends dosage changes;
- modifies medication schedules without human/admin action;
- hides missed reminders;
- suppresses emergency alerts;
- deletes audit logs;
- sends full medical records to LLM prompts by default.

Medication and alert logic must be deterministic and testable.

## Coding standards

- Prefer TypeScript.
- Prefer explicit domain types.
- Use validation at API boundaries.
- Keep business logic out of route handlers.
- Write tests for reminder, medication, alert, and audit behavior.
- Keep provider-specific AI code behind interfaces.
- Do not introduce large dependencies without explaining why.
- Do not commit secrets.

## Initial repo structure

```text
apps/
  api/
  dashboard/
  device-web/
packages/
  domain/
  ai-providers/
  config/
  testing/
docs/
```

## First implementation target

Start with backend foundation:

1. Resident model.
2. Medication model.
3. MedicationSchedule model.
4. ReminderEvent model.
5. Alert model.
6. AuditLog model.
7. Reminder confirmation flow.
8. Alert creation for missed/unknown medication events.
9. Unit tests.
10. Seed data.

Do not start with OpenAI Realtime integration until the reminder and alert domain is stable.

## Review checklist

When reviewing or modifying code, check:

- Are medical safety rules enforced in code, not just prompts?
- Are audit logs written for sensitive actions?
- Are medication events traceable?
- Are LLM provider calls isolated?
- Are tests present for critical branches?
- Are errors handled explicitly?
- Are environment variables documented?


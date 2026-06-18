# Project Specification — AI Voice Companion for Elderly Care

## 1. Product vision

Build a voice-first AI companion for elderly people, initially designed for use in retirement homes, assisted-living facilities, and private family care contexts.

The product is not a doctor, nurse, or emergency medical device. It is a companion and assistance layer that can:

- provide friendly conversation;
- remind the resident to take scheduled medication;
- record simple confirmations such as “taken”, “not taken”, or “I don’t know”;
- escalate uncertainty, missed reminders, or emergency-like situations to a human caregiver;
- maintain a structured resident profile and a separate conversation memory;
- provide caregivers and family members with a simple dashboard.

Core product principle:

> Always-on locally, AI-on only when useful.

The local device should continuously perform cheap, privacy-preserving detection such as wake word, voice activity detection, emergency phrase detection, and scheduled reminder triggers. Cloud AI should only be activated when there is a real interaction, conversation, or escalation need.

## 2. Primary users

### Resident

An elderly person living in a retirement home, EHPAD, assisted-living residence, or at home with family support.

Needs:

- simple voice interaction;
- medication reminders;
- reassurance;
- conversation;
- help contacting someone;
- minimal visual or technical complexity.

### Family caregiver

A family member who wants light monitoring and reassurance.

Needs:

- know whether medication reminders were acknowledged;
- receive alerts when something unusual happens;
- configure contacts, routines, and preferences;
- avoid intrusive surveillance.

### Professional caregiver / facility staff

Care staff in a retirement home or care facility.

Needs:

- simple alert handling;
- audit trail;
- low false-positive rate;
- clear separation between AI companion features and medical care responsibility.

## 3. MVP scope

The MVP should prove four things:

1. Voice interaction works reliably in a real room.
2. Medication reminders can be handled deterministically and safely.
3. The cost per resident can be controlled by avoiding permanent cloud AI streaming.
4. Caregivers see practical value through alerts, summaries, and logs.

### MVP features

- Resident profile CRUD.
- Medication schedule CRUD.
- Scheduled medication reminders.
- Voice confirmation of reminder status.
- Simple conversation mode through an AI voice provider.
- Local wake-word / activation placeholder interface.
- Emergency phrase placeholder interface.
- Caregiver dashboard.
- Alert creation and acknowledgement.
- Daily summary generation.
- Audit logs.

### MVP non-goals

The MVP must not:

- diagnose medical conditions;
- recommend medication dosage;
- change a treatment plan;
- claim to detect falls, strokes, heart attacks, or other medical events unless externally certified and validated;
- act as a substitute for a nurse, doctor, or emergency service;
- silently record everything by default;
- expose full medical records to the language model without tool-based access control.

## 4. Safety rules

These rules are hard product constraints, not just prompt instructions.

1. The AI must never recommend changing medication dosage.
2. The AI must never say that a treatment was medically appropriate unless that comes from an approved care plan.
3. The AI must escalate medication uncertainty to a human caregiver.
4. The AI must escalate emergency-like language immediately.
5. The AI must not hide failed reminders or failed alerts.
6. All medication reminder events must be logged.
7. All caregiver alerts must have a status: `created`, `sent`, `acknowledged`, `resolved`, or `failed`.
8. Resident consent and privacy settings must be modeled explicitly.
9. Medical data, conversation memory, and audit logs must be stored separately.
10. Prompts must include only the minimum data needed for the current task.

## 5. Recommended technical architecture

### High-level architecture

```text
Local device / tablet
  ├─ Local VAD / wake word / emergency phrase detector
  ├─ Local reminder scheduler fallback
  ├─ Microphone + speaker interface
  ├─ Voice session client
  └─ Backend API client

Backend API
  ├─ Resident profile service
  ├─ Medication schedule service
  ├─ Reminder engine
  ├─ Alert escalation service
  ├─ Conversation memory service
  ├─ AI provider abstraction
  ├─ Audit log service
  └─ Caregiver dashboard API

External services
  ├─ AI voice provider, initially OpenAI Realtime
  ├─ Optional text LLM provider, e.g. Claude for summaries
  ├─ Notification provider: SMS, email, push, facility dashboard
  └─ Hosting / database provider
```

### Provider abstraction

The codebase should not be coupled to one AI provider.

Create interfaces such as:

```text
VoiceProvider
  - startSession(residentId, context)
  - sendAudioChunk(sessionId, audio)
  - receiveAudio(sessionId)
  - endSession(sessionId)

TextLLMProvider
  - generateDailySummary(events, profile)
  - classifyConversationRisk(transcript)
  - generateConversationPrompt(profile, memory)
```

Initial implementation can use OpenAI Realtime for voice. Keep the interface provider-agnostic so Claude, Grok, or another provider can be swapped later.

## 6. Recommended stack for MVP

Use a simple TypeScript-first monorepo.

```text
Runtime / package manager:
- Node.js LTS
- pnpm
- TypeScript

Backend:
- NestJS or Fastify
- PostgreSQL
- Prisma ORM
- Zod for validation
- BullMQ or Temporal for scheduled jobs

Dashboard:
- Next.js
- React
- Tailwind CSS or shadcn/ui

Device app:
- Start with a simple web/PWA or React Native Android prototype
- Later: dedicated Android tablet app

AI:
- OpenAI Realtime for speech-to-speech prototype
- Optional Claude text model for long summaries and non-real-time analysis

Infra:
- Docker Compose for local dev
- GitHub Actions for CI
- Sentry for errors
- Structured logs
```

## 7. Data model draft

### Resident

```text
Resident
- id
- firstName
- preferredName
- dateOfBirth
- language
- voicePreferences
- consentStatus
- privacySettings
- createdAt
- updatedAt
```

### Caregiver

```text
Caregiver
- id
- name
- role: family | nurse | facility_staff | admin
- phone
- email
- notificationPreferences
- createdAt
- updatedAt
```

### Medication

```text
Medication
- id
- residentId
- name
- dosageLabel
- instructionsLabel
- prescribingSourceLabel
- active
- createdAt
- updatedAt
```

Important: `dosageLabel` is display-only. The AI must not calculate or modify dosage.

### MedicationSchedule

```text
MedicationSchedule
- id
- medicationId
- residentId
- timeOfDay
- recurrenceRule
- startDate
- endDate
- active
- createdAt
- updatedAt
```

### ReminderEvent

```text
ReminderEvent
- id
- residentId
- medicationScheduleId
- scheduledAt
- deliveredAt
- status: scheduled | delivered | confirmed_taken | confirmed_not_taken | unknown | missed | escalated
- confirmationSource: voice | caregiver | dashboard | manual
- transcriptSnippet
- createdAt
- updatedAt
```

### Alert

```text
Alert
- id
- residentId
- type: missed_medication | medication_uncertainty | emergency_phrase | wellbeing_concern | device_offline | other
- severity: low | medium | high | critical
- status: created | sent | acknowledged | resolved | failed
- message
- assignedToCaregiverId
- createdAt
- acknowledgedAt
- resolvedAt
```

### ConversationMemory

```text
ConversationMemory
- id
- residentId
- type: preference | biographical_fact | routine | family_relation | topic_interest
- content
- confidence
- sourceConversationId
- createdAt
- updatedAt
```

### AuditLog

```text
AuditLog
- id
- actorType: resident | caregiver | system | ai
- actorId
- action
- entityType
- entityId
- metadata
- createdAt
```

## 8. Voice event state machine

```text
IDLE_LOCAL_LISTENING
  -> WAKE_WORD_DETECTED
  -> SPEAKER_CHECK
  -> INTENT_ROUTING
      -> LOCAL_REMINDER_FLOW
      -> AI_CONVERSATION_SESSION
      -> EMERGENCY_ESCALATION
      -> CAREGIVER_CALL_REQUEST
  -> SESSION_ENDED
  -> IDLE_LOCAL_LISTENING
```

Medication reminder flow:

```text
REMINDER_DUE
  -> PLAY_REMINDER
  -> WAIT_FOR_CONFIRMATION
      -> CONFIRMED_TAKEN
      -> CONFIRMED_NOT_TAKEN
      -> UNKNOWN
      -> NO_RESPONSE
  -> LOG_EVENT
  -> ESCALATE_IF_NEEDED
```

## 9. Prompt and tool safety model

The AI should not receive full database access. It should call controlled backend tools.

Allowed tools:

```text
getResidentSafeProfile(residentId)
getTodayMedicationReminders(residentId)
recordMedicationConfirmation(eventId, status)
createCaregiverAlert(residentId, type, severity, message)
getConversationPreferences(residentId)
saveConversationMemory(residentId, type, content, confidence)
```

Forbidden tool behavior:

```text
changeMedicationDosage
createNewPrescription
deleteAuditLog
silenceEmergencyAlert
sendFullMedicalRecordToLLM
```

## 10. Development roadmap

### Phase 1 — Repo and backend foundation

- Create monorepo.
- Add backend service.
- Add PostgreSQL and Prisma.
- Implement Resident, Caregiver, Medication, MedicationSchedule, ReminderEvent, Alert, AuditLog.
- Add unit tests.
- Add seed data.

### Phase 2 — Reminder engine

- Implement scheduler.
- Generate reminder events.
- Confirm reminders.
- Escalate missed or uncertain reminders.
- Add dashboard view.

### Phase 3 — Voice prototype

- Add local mock voice interface first.
- Add AI voice provider abstraction.
- Implement OpenAI Realtime provider behind the interface.
- Add cost logging per session.

### Phase 4 — Memory and summaries

- Add conversation memory service.
- Add daily summary generation.
- Add caregiver summary screen.

### Phase 5 — Real-world testing

- Test in noisy rooms.
- Measure false wakeups.
- Measure reminder confirmation rate.
- Measure cost per resident per day.
- Log UX failures.

## 11. First engineering milestone

The first coding milestone is not the voice AI.

Build this first:

1. Backend API.
2. PostgreSQL schema.
3. Medication reminder engine.
4. Alert system.
5. Minimal caregiver dashboard.
6. Mock voice input endpoint.

Only after that, connect the real voice provider.

## 12. Initial acceptance criteria

The first working demo should allow the following flow:

1. Admin creates a resident.
2. Admin creates a medication and schedule.
3. Scheduler creates a reminder event.
4. Device/mock client receives reminder.
5. Resident says or selects “taken”, “not taken”, or “I don’t know”.
6. Backend records the event.
7. If “not taken”, “I don’t know”, or no response, backend creates an alert.
8. Caregiver dashboard displays the alert.
9. All key actions appear in the audit log.


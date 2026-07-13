import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  OpenAiSpeechProvider,
  OpenAiCompanionChatProvider,
  formatToday,
  type ChatMessage,
  type DueReminder,
  type MedicationReminderRef,
} from "@eldercare/ai-providers";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { ReminderConfirmationService } from "../reminder/reminder-confirmation.service";
import { MemoryService } from "../memory/memory.service";

export interface ConverseInput {
  residentId: string;
  audioBase64: string;
  mimeType: string;
  language?: "fr" | "en";
  history?: ChatMessage[];
}

export interface ConverseResult {
  transcript: string;
  reply: string;
  audioBase64: string;
  audioMimeType: string;
  /** Set when the resident confirmed/denied a medication during this turn. */
  confirmation?: {
    medicationName: string;
    status: "confirmed_taken" | "confirmed_not_taken" | "unknown";
  };
}

export interface ChatTextInput {
  residentId: string;
  text: string;
  language?: "fr" | "en";
  history?: ChatMessage[];
}

export interface AnnounceInput {
  residentId: string;
  reminderId: string;
}

export interface AnnounceResult {
  text: string;
  audioBase64: string;
  audioMimeType: string;
  medicationName: string;
}

/**
 * Deterministic medication-reminder announcement — NOT AI-generated. The wording
 * is fixed so a medication prompt is predictable and auditable; the AI is only
 * used to synthesize the voice and to understand the resident's spoken reply.
 */
function buildReminderAnnouncement(opts: {
  name?: string;
  medicationName: string;
  language: "fr" | "en";
}): string {
  const greeting = opts.name ? `${opts.name}, ` : "";
  if (opts.language === "en") {
    return `Hello ${greeting}it's time to take your ${opts.medicationName}.`;
  }
  return `Bonjour ${greeting}c'est l'heure de prendre votre ${opts.medicationName}.`;
}

/**
 * Orchestrates one conversational turn for the voice companion:
 *   audio in -> transcribe (ears) -> chat (brain) -> synthesize (voice) -> audio out.
 *
 * When the resident is known and has consented, the companion is also made aware
 * of medications currently due, can gently remind, and a spoken confirmation is
 * recorded through the deterministic backend (which owns medication truth and
 * creates alerts). Raw audio is never persisted — only metadata is audited.
 */
@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  private readonly speech: OpenAiSpeechProvider;
  private readonly chat: OpenAiCompanionChatProvider;
  private readonly configured: boolean;

  constructor(
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
    private readonly confirmation: ReminderConfirmationService,
    private readonly memory: MemoryService,
  ) {
    const apiKey = process.env.OPENAI_API_KEY ?? "";
    this.configured = apiKey.length > 0;
    if (!this.configured) {
      this.logger.warn(
        "OPENAI_API_KEY is not set — the voice endpoint will return an error until it is configured.",
      );
    }
    this.speech = new OpenAiSpeechProvider({ apiKey });
    this.chat = new OpenAiCompanionChatProvider({ apiKey });
  }

  async converse(input: ConverseInput): Promise<ConverseResult> {
    if (!this.configured) {
      throw new Error("Voice companion is not configured (missing OPENAI_API_KEY).");
    }

    const audio = Buffer.from(input.audioBase64, "base64");

    // Resolve the resident (if a real one) so we can personalise + surface
    // due reminders. Unknown / "demo" ids fall back to a generic companion.
    const resident = await this.loadResident(input.residentId);
    const language = input.language ?? (resident?.language as "fr" | "en") ?? "fr";

    // Pending medication reminders the companion is allowed to mention. Gated on
    // consent — no medical context for residents who have not consented to AI.
    const pending = resident ? await this.loadDueReminders(resident.id) : [];
    const dueReminders: DueReminder[] = pending.map((p) => ({
      medicationName: p.medicationSchedule.medication.name,
      timeOfDay: p.medicationSchedule.timeOfDay,
    }));
    const reminderRefs: MedicationReminderRef[] = pending.map((p) => ({
      id: p.id,
      medicationName: p.medicationSchedule.medication.name,
    }));

    // 1. Ears — transcribe what the resident said.
    const { text: transcript } = await this.speech.transcribe({
      audio,
      mimeType: input.mimeType,
      language,
    });

    // 2. Brain — short, safe, spoken-friendly reply (aware of due reminders).
    const messages: ChatMessage[] = [
      ...(input.history ?? []),
      { role: "user", content: transcript },
    ];
    const { text: reply } = await this.chat.reply(
      { residentId: input.residentId, messages },
      {
        language,
        residentFirstName: resident?.preferredName ?? resident?.firstName,
        dueReminders,
        currentDate: formatToday(language),
      },
    );

    // 3. Did the resident confirm/deny a medication? Classify, then record it
    //    through the deterministic backend (NOT the AI) so the audit trail and
    //    any alert come from the source of truth.
    let confirmation: ConverseResult["confirmation"];
    if (reminderRefs.length > 0) {
      const classified = await this.chat.classifyMedicationResponse({
        transcript,
        reminders: reminderRefs,
        language,
      });
      if (classified) {
        confirmation = await this.recordConfirmation(
          classified.reminderId,
          classified.status,
          transcript,
          reminderRefs,
        );
      }
    }

    // 4. Voice — synthesize the reply.
    const speechOut = await this.speech.synthesize({ text: reply, language });

    // 5. Audit — metadata only; never raw audio or full transcripts.
    await this.audit.log({
      actorType: "ai",
      action: "voice.conversation",
      entityType: "Resident",
      entityId: input.residentId,
      metadata: {
        transcriptLength: transcript.length,
        replyLength: reply.length,
        language,
        remindersDue: reminderRefs.length,
        confirmed: confirmation?.status ?? null,
      },
    });

    return {
      transcript,
      reply,
      audioBase64: speechOut.audio.toString("base64"),
      audioMimeType: speechOut.mimeType,
      confirmation,
    };
  }

  /**
   * Text-based conversational turn — same as converse() but skips Whisper STT.
   * Used when the client already has a transcript (e.g. Web Speech API wake-word flow).
   */
  async chatText(input: ChatTextInput): Promise<ConverseResult> {
    if (!this.configured) {
      throw new Error("Voice companion is not configured (missing OPENAI_API_KEY).");
    }

    const resident = await this.loadResident(input.residentId);
    const language = input.language ?? (resident?.language as "fr" | "en") ?? "fr";

    const pending = resident ? await this.loadDueReminders(resident.id) : [];
    const dueReminders: DueReminder[] = pending.map((p) => ({
      medicationName: p.medicationSchedule.medication.name,
      timeOfDay: p.medicationSchedule.timeOfDay,
    }));
    const reminderRefs: MedicationReminderRef[] = pending.map((p) => ({
      id: p.id,
      medicationName: p.medicationSchedule.medication.name,
    }));

    const transcript = input.text;

    // Curated memory the companion remembers about this person (non-medical).
    const memoryFacts = resident ? await this.memory.loadFacts(resident.id) : [];

    const messages: ChatMessage[] = [
      ...(input.history ?? []),
      { role: "user", content: transcript },
    ];
    const { text: reply } = await this.chat.reply(
      { residentId: input.residentId, messages },
      {
        language,
        residentFirstName: resident?.preferredName ?? resident?.firstName,
        dueReminders,
        memoryFacts,
        currentDate: formatToday(language),
        gender: (resident?.gender as any) ?? undefined,
        familyContact: resident
          ? {
              name: resident.familyContactName ?? undefined,
              relation: resident.familyContactRelation ?? undefined,
            }
          : undefined,
      },
    );

    let confirmation: ConverseResult["confirmation"];
    if (reminderRefs.length > 0) {
      const classified = await this.chat.classifyMedicationResponse({
        transcript,
        reminders: reminderRefs,
        language,
      });
      if (classified) {
        confirmation = await this.recordConfirmation(
          classified.reminderId,
          classified.status,
          transcript,
          reminderRefs,
        );
      }
    }

    const speechOut = await this.speech.synthesize({ text: reply, language });

    // Update long-term memory from this exchange (best-effort, consent-gated).
    if (resident) {
      void this.memory.recordConversation(resident.id, [
        { role: "user", content: transcript },
        { role: "assistant", content: reply },
      ]);
    }

    await this.audit.log({
      actorType: "ai",
      action: "voice.chat",
      entityType: "Resident",
      entityId: input.residentId,
      metadata: {
        transcriptLength: transcript.length,
        replyLength: reply.length,
        language,
        remindersDue: reminderRefs.length,
        confirmed: confirmation?.status ?? null,
      },
    });

    return {
      transcript,
      reply,
      audioBase64: speechOut.audio.toString("base64"),
      audioMimeType: speechOut.mimeType,
      confirmation,
    };
  }

  /**
   * Proactively announce a due medication reminder (the device plays this at the
   * scheduled time, no user input). Deterministic wording, spoken via TTS. Marks
   * the reminder "delivered" so it isn't announced twice.
   */
  async announce(input: AnnounceInput): Promise<AnnounceResult> {
    if (!this.configured) {
      throw new Error("Voice companion is not configured (missing OPENAI_API_KEY).");
    }

    const resident = await this.loadResident(input.residentId);
    const reminder = await this.prisma.reminderEvent.findUnique({
      where: { id: input.reminderId },
      include: { medicationSchedule: { include: { medication: true } } },
    });
    if (!reminder || reminder.residentId !== input.residentId) {
      throw new NotFoundException(`Reminder ${input.reminderId} not found for resident`);
    }

    const language = (resident?.language as "fr" | "en") ?? "fr";
    const medicationName = reminder.medicationSchedule.medication.name;
    const text = buildReminderAnnouncement({
      name: resident?.preferredName ?? resident?.firstName,
      medicationName,
      language,
    });

    const speechOut = await this.speech.synthesize({ text, language });

    // Mark delivered so the device doesn't announce it again. The resident's
    // spoken reply (via /voice/converse) records the actual confirmation.
    await this.confirmation.markAsDelivered(reminder.id).catch((err) => {
      this.logger.warn(
        `Could not mark reminder ${reminder.id} delivered: ${(err as Error).message}`,
      );
    });

    await this.audit.log({
      actorType: "ai",
      action: "voice.reminder_announced",
      entityType: "ReminderEvent",
      entityId: reminder.id,
      metadata: { residentId: input.residentId, medication: medicationName },
    });

    return {
      text,
      audioBase64: speechOut.audio.toString("base64"),
      audioMimeType: speechOut.mimeType,
      medicationName,
    };
  }

  /**
   * Dev/test helper: creates a ReminderEvent scheduled for right now so the
   * device can immediately test the announcement flow without waiting for the
   * nightly cron to generate real reminders.
   */
  async createTestReminder(residentId: string): Promise<{ reminderId: string }> {
    const schedule = await this.prisma.medicationSchedule.findFirst({
      where: { medication: { residentId } },
    });
    if (!schedule) {
      throw new Error(
        `No medication schedule found for resident ${residentId} — add a medication first.`,
      );
    }
    const reminder = await this.prisma.reminderEvent.create({
      data: {
        residentId,
        medicationScheduleId: schedule.id,
        scheduledAt: new Date(),
        status: "scheduled",
      },
    });
    return { reminderId: reminder.id };
  }

  /** Loads the resident only if the id is a real, AI-consented resident. */
  private async loadResident(residentId: string) {
    if (!residentId || residentId === "demo") return null;
    const resident = await this.prisma.resident
      .findUnique({ where: { id: residentId } })
      .catch(() => null);
    if (!resident) return null;

    const consented =
      resident.consentStatus === "granted" ||
      resident.consentStatus === "guardian_granted";
    const privacy = (resident.privacySettings ?? {}) as {
      allowAiConversation?: boolean;
    };
    if (!consented || privacy.allowAiConversation === false) {
      this.logger.warn(
        `Resident ${residentId} has not consented to AI conversation — generic mode.`,
      );
      return null;
    }
    return resident;
  }

  /** Pending medication reminders already due (scheduled/delivered, time passed). */
  private async loadDueReminders(residentId: string) {
    return this.prisma.reminderEvent.findMany({
      where: {
        residentId,
        status: { in: ["scheduled", "delivered"] },
        scheduledAt: { lte: new Date() },
      },
      include: { medicationSchedule: { include: { medication: true } } },
      orderBy: { scheduledAt: "asc" },
      take: 5,
    });
  }

  /** Records the confirmation via the deterministic backend (source of truth). */
  private async recordConfirmation(
    reminderId: string,
    status: "confirmed_taken" | "confirmed_not_taken" | "unknown",
    transcript: string,
    reminderRefs: MedicationReminderRef[],
  ): Promise<ConverseResult["confirmation"]> {
    try {
      await this.confirmation.confirm(reminderId, {
        status,
        confirmationSource: "voice",
        transcriptSnippet: transcript.slice(0, 280),
      });
      const ref = reminderRefs.find((r) => r.id === reminderId);
      return { medicationName: ref?.medicationName ?? "medication", status };
    } catch (err) {
      // E.g. already in a terminal status — log and continue the conversation.
      this.logger.warn(
        `Could not record voice confirmation for ${reminderId}: ${(err as Error).message}`,
      );
      return undefined;
    }
  }
}

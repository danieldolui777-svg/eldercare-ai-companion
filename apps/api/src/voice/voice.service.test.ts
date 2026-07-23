import { describe, it, expect, beforeEach, vi } from "vitest";
import { VoiceService } from "./voice.service";

// Safety-sensitive: a spoken medication confirmation must be recorded through
// the deterministic backend (confirm) with source "voice" — the AI only
// classifies; the backend owns the truth and any resulting alert.

const RESIDENT = {
  id: "res-1",
  firstName: "Jeanne",
  preferredName: "Jeanne",
  language: "fr",
  consentStatus: "granted",
  privacySettings: { allowAiConversation: true },
};

const PENDING = [
  {
    id: "evt-1",
    medicationSchedule: { timeOfDay: "08:00", medication: { name: "Doliprane" } },
  },
];

function makePrisma() {
  return {
    resident: { findUnique: vi.fn().mockResolvedValue(RESIDENT) },
    reminderEvent: { findMany: vi.fn().mockResolvedValue(PENDING) },
  };
}

function build(classification: any, transcribeText = "...") {
  const audit = { log: vi.fn().mockResolvedValue(undefined) };
  const prisma = makePrisma();
  const confirmation = { confirm: vi.fn().mockResolvedValue({ id: "evt-1" }) };
  // Memory is best-effort and consent-gated; stub it out for these tests.
  const memory = {
    loadFacts: vi.fn().mockResolvedValue([]),
    recordConversation: vi.fn().mockResolvedValue(undefined),
  };
  const alerts = { create: vi.fn().mockResolvedValue({ id: "alert-1" }) };

  process.env.OPENAI_API_KEY = "test-key";
  const service = new VoiceService(
    audit as any,
    prisma as any,
    confirmation as any,
    memory as any,
    alerts as any,
  );
  (service as any).speech = {
    transcribe: vi.fn().mockResolvedValue({ text: transcribeText }),
    synthesize: vi
      .fn()
      .mockResolvedValue({ audio: Buffer.from("x"), mimeType: "audio/mpeg" }),
  };
  (service as any).chat = {
    reply: vi.fn().mockResolvedValue({ text: "D'accord, merci !" }),
    classifyMedicationResponse: vi.fn().mockResolvedValue(classification),
  };
  return { service, prisma, confirmation, alerts };
}

const baseInput = {
  residentId: "res-1",
  audioBase64: Buffer.from("audio").toString("base64"),
  mimeType: "audio/webm",
  language: "fr" as const,
};

describe("VoiceService.converse — A+B link", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records a spoken 'taken' via the deterministic backend with source voice", async () => {
    const { service, confirmation } = build({
      reminderId: "evt-1",
      status: "confirmed_taken",
    });

    const result = await service.converse(baseInput);

    expect(confirmation.confirm).toHaveBeenCalledWith(
      "evt-1",
      expect.objectContaining({
        status: "confirmed_taken",
        confirmationSource: "voice",
      }),
    );
    expect(result.confirmation).toEqual({
      medicationName: "Doliprane",
      status: "confirmed_taken",
    });
  });

  it("records a spoken 'not taken' (the alert-creating path)", async () => {
    const { service, confirmation } = build({
      reminderId: "evt-1",
      status: "confirmed_not_taken",
    });

    await service.converse(baseInput);

    expect(confirmation.confirm).toHaveBeenCalledWith(
      "evt-1",
      expect.objectContaining({ status: "confirmed_not_taken" }),
    );
  });

  it("does NOT record anything for ordinary chit-chat (no classification)", async () => {
    const { service, confirmation } = build(null);

    const result = await service.converse(baseInput);

    expect(confirmation.confirm).not.toHaveBeenCalled();
    expect(result.confirmation).toBeUndefined();
  });

  it("stays generic for the demo resident — no reminders, no recording", async () => {
    const { service, prisma, confirmation } = build({
      reminderId: "evt-1",
      status: "confirmed_taken",
    });

    await service.converse({ ...baseInput, residentId: "demo" });

    expect(prisma.reminderEvent.findMany).not.toHaveBeenCalled();
    expect(confirmation.confirm).not.toHaveBeenCalled();
  });
});

describe("VoiceService — emergency-phrase detection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("raises a critical emergency alert when the resident cries for help", async () => {
    const { service, alerts } = build(null, "au secours, aidez-moi");

    await service.converse(baseInput);

    expect(alerts.create).toHaveBeenCalledWith(
      expect.objectContaining({
        residentId: "res-1",
        type: "emergency_phrase",
        severity: "critical",
      }),
    );
  });

  it("detects distress in the text (chatText) path too", async () => {
    const { service, alerts } = build(null);

    await service.chatText({
      residentId: "res-1",
      text: "je suis tombée, je n'arrive plus à me relever",
      language: "fr",
    });

    expect(alerts.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: "emergency_phrase" }),
    );
  });

  it("does NOT raise an alert for ordinary conversation", async () => {
    const { service, alerts } = build(null, "bonjour, il fait beau aujourd'hui");

    await service.converse(baseInput);

    expect(alerts.create).not.toHaveBeenCalled();
  });

  it("does NOT raise an alert for a negated phrase", async () => {
    const { service, alerts } = build(null);

    await service.chatText({
      residentId: "res-1",
      text: "ne t'inquiète pas, je n'ai pas mal à la poitrine",
      language: "fr",
    });

    expect(alerts.create).not.toHaveBeenCalled();
  });

  it("does NOT raise an alert for the demo resident (no real record to attach)", async () => {
    const { service, alerts } = build(null, "au secours");

    await service.converse({ ...baseInput, residentId: "demo" });

    expect(alerts.create).not.toHaveBeenCalled();
  });

  it("still replies normally even if raising the alert fails", async () => {
    const { service, alerts } = build(null, "au secours");
    alerts.create.mockRejectedValueOnce(new Error("db down"));

    const result = await service.converse(baseInput);

    // The conversation must not break because the alert write failed.
    expect(result.reply).toBeTruthy();
  });
});

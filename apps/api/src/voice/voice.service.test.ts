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

function build(classification: any) {
  const audit = { log: vi.fn().mockResolvedValue(undefined) };
  const prisma = makePrisma();
  const confirmation = { confirm: vi.fn().mockResolvedValue({ id: "evt-1" }) };

  process.env.OPENAI_API_KEY = "test-key";
  const service = new VoiceService(
    audit as any,
    prisma as any,
    confirmation as any,
  );
  (service as any).speech = {
    transcribe: vi.fn().mockResolvedValue({ text: "..." }),
    synthesize: vi
      .fn()
      .mockResolvedValue({ audio: Buffer.from("x"), mimeType: "audio/mpeg" }),
  };
  (service as any).chat = {
    reply: vi.fn().mockResolvedValue({ text: "D'accord, merci !" }),
    classifyMedicationResponse: vi.fn().mockResolvedValue(classification),
  };
  return { service, prisma, confirmation };
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

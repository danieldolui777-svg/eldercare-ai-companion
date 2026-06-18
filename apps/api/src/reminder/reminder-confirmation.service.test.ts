import { describe, it, expect, beforeEach, vi } from "vitest";
import { ReminderConfirmationService } from "./reminder-confirmation.service";
import { NotFoundException, BadRequestException } from "@nestjs/common";

function makeEvent(overrides: Partial<any> = {}) {
  return {
    id: "evt-1",
    residentId: "res-1",
    medicationScheduleId: "sched-1",
    scheduledAt: new Date(),
    deliveredAt: null,
    status: "scheduled",
    confirmationSource: null,
    transcriptSnippet: null,
    medicationSchedule: {
      medication: { name: "Doliprane" },
    },
    ...overrides,
  };
}

function makePrisma(event: any) {
  return {
    reminderEvent: {
      findUnique: vi.fn().mockResolvedValue(event),
      findUniqueOrThrow: vi.fn().mockResolvedValue(event),
      update: vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({ ...event, ...data }),
      ),
    },
  };
}

function makeAudit() {
  return { log: vi.fn().mockResolvedValue(undefined) };
}

function makeAlert() {
  return { create: vi.fn().mockResolvedValue({ id: "alert-1" }) };
}

describe("ReminderConfirmationService.confirm", () => {
  let service: ReminderConfirmationService;
  let prisma: ReturnType<typeof makePrisma>;
  let audit: ReturnType<typeof makeAudit>;
  let alertSvc: ReturnType<typeof makeAlert>;

  beforeEach(() => {
    const event = makeEvent();
    prisma = makePrisma(event);
    audit = makeAudit();
    alertSvc = makeAlert();
    service = new ReminderConfirmationService(
      prisma as any,
      audit as any,
      alertSvc as any,
    );
  });

  it("updates status to confirmed_taken and does NOT create an alert", async () => {
    const result = await service.confirm("evt-1", {
      status: "confirmed_taken",
      confirmationSource: "voice",
    });

    expect(result.status).toBe("confirmed_taken");
    expect(alertSvc.create).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "reminderEvent.confirmed" }),
    );
  });

  it("creates a missed_medication alert when status is confirmed_not_taken", async () => {
    await service.confirm("evt-1", {
      status: "confirmed_not_taken",
      confirmationSource: "voice",
    });

    expect(alertSvc.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "missed_medication",
        residentId: "res-1",
      }),
    );
  });

  it("creates a medication_uncertainty alert when status is unknown", async () => {
    await service.confirm("evt-1", {
      status: "unknown",
      confirmationSource: "dashboard",
    });

    expect(alertSvc.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: "medication_uncertainty" }),
    );
  });

  it("creates a missed_medication alert with high severity when status is missed", async () => {
    await service.confirm("evt-1", {
      status: "missed",
      confirmationSource: "manual",
    });

    expect(alertSvc.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "missed_medication",
        severity: "high",
      }),
    );
  });

  it("throws NotFoundException when event does not exist", async () => {
    prisma.reminderEvent.findUnique.mockResolvedValue(null);

    await expect(
      service.confirm("non-existent", {
        status: "confirmed_taken",
        confirmationSource: "voice",
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it("throws BadRequestException when event is already in terminal status", async () => {
    const terminalEvent = makeEvent({ status: "confirmed_taken" });
    prisma.reminderEvent.findUnique.mockResolvedValue(terminalEvent);

    await expect(
      service.confirm("evt-1", {
        status: "confirmed_not_taken",
        confirmationSource: "voice",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("saves the transcript snippet when provided", async () => {
    await service.confirm("evt-1", {
      status: "confirmed_taken",
      confirmationSource: "voice",
      transcriptSnippet: "Oui j'ai pris mes médicaments",
    });

    expect(prisma.reminderEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          transcriptSnippet: "Oui j'ai pris mes médicaments",
        }),
      }),
    );
  });
});

describe("ReminderConfirmationService.markAsMissed", () => {
  it("marks event as missed and creates a high-severity alert", async () => {
    const event = makeEvent({ status: "delivered" });
    const prisma = makePrisma(event);
    const audit = makeAudit();
    const alertSvc = makeAlert();
    const service = new ReminderConfirmationService(
      prisma as any,
      audit as any,
      alertSvc as any,
    );

    await service.markAsMissed("evt-1");

    expect(prisma.reminderEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "missed" } }),
    );
    expect(alertSvc.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: "missed_medication", severity: "high" }),
    );
  });

  it("is idempotent when event is already in terminal status", async () => {
    const event = makeEvent({ status: "confirmed_taken" });
    const prisma = makePrisma(event);
    const audit = makeAudit();
    const alertSvc = makeAlert();
    const service = new ReminderConfirmationService(
      prisma as any,
      audit as any,
      alertSvc as any,
    );

    const result = await service.markAsMissed("evt-1");

    expect(prisma.reminderEvent.update).not.toHaveBeenCalled();
    expect(alertSvc.create).not.toHaveBeenCalled();
    expect(result.status).toBe("confirmed_taken");
  });
});

import { describe, it, expect, vi } from "vitest";
import { AlertService, buildAlertSms } from "./alert.service";
import { NotFoundException } from "@nestjs/common";

function makeAlert(overrides: Partial<any> = {}) {
  return {
    id: "alert-1",
    residentId: "res-1",
    type: "missed_medication",
    severity: "high",
    status: "created",
    message: "Resident did not take Doliprane",
    assignedToCaregiverId: null,
    createdAt: new Date(),
    acknowledgedAt: null,
    resolvedAt: null,
    ...overrides,
  };
}

function makePrisma(alert: any, resident: any = { firstName: "Jeanne", preferredName: null, familyContactPhone: null }) {
  return {
    alert: {
      create: vi.fn().mockResolvedValue(alert),
      findUnique: vi.fn().mockResolvedValue(alert),
      update: vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({ ...alert, ...data }),
      ),
      findMany: vi.fn().mockResolvedValue([alert]),
    },
    resident: {
      findUnique: vi.fn().mockResolvedValue(resident),
    },
  };
}

function makeAudit() {
  return { log: vi.fn().mockResolvedValue(undefined) };
}

function makeNotifier(result: any = { ok: true, id: "SM123" }) {
  return { name: "twilio", sendSms: vi.fn().mockResolvedValue(result) };
}

describe("AlertService.create", () => {
  it("creates an alert with status=created and writes an audit log", async () => {
    const alert = makeAlert();
    const prisma = makePrisma(alert);
    const audit = makeAudit();
    const service = new AlertService(prisma as any, audit as any);

    const result = await service.create({
      residentId: "res-1",
      type: "missed_medication",
      severity: "high",
      message: "Test",
    });

    expect(result.status).toBe("created");
    expect(prisma.alert.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "created" }) }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "alert.created", entityId: "alert-1" }),
    );
  });
});

describe("AlertService.create — SMS notification", () => {
  const params = {
    residentId: "res-1",
    type: "missed_medication" as const,
    severity: "high" as const,
    message: "Resident did not take Doliprane",
  };

  it("texts the emergency contact when a provider and phone are set", async () => {
    const prisma = makePrisma(makeAlert(), {
      firstName: "Jeanne",
      preferredName: "Jeannette",
      familyContactPhone: "+33612345678",
    });
    const notifier = makeNotifier();
    const service = new AlertService(prisma as any, makeAudit() as any, notifier as any);

    await service.create(params);

    expect(notifier.sendSms).toHaveBeenCalledTimes(1);
    const sent = notifier.sendSms.mock.calls[0][0];
    expect(sent.to).toBe("+33612345678");
    expect(sent.body).toContain("Jeannette"); // uses preferred name
    // Data minimisation: the SMS must NOT leak medical specifics.
    expect(sent.body).not.toContain("Doliprane");
  });

  it("audits a successful send as alert.notification_sent", async () => {
    const prisma = makePrisma(makeAlert(), {
      firstName: "Jeanne",
      preferredName: null,
      familyContactPhone: "+33612345678",
    });
    const audit = makeAudit();
    const service = new AlertService(prisma as any, audit as any, makeNotifier() as any);

    await service.create(params);

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "alert.notification_sent" }),
    );
  });

  it("does not send when the resident has no emergency-contact phone", async () => {
    const prisma = makePrisma(makeAlert(), {
      firstName: "Jeanne",
      preferredName: null,
      familyContactPhone: null,
    });
    const notifier = makeNotifier();
    const service = new AlertService(prisma as any, makeAudit() as any, notifier as any);

    const result = await service.create(params);

    expect(notifier.sendSms).not.toHaveBeenCalled();
    expect(result.status).toBe("created"); // alert still created
  });

  it("still creates the alert when the SMS send fails", async () => {
    const prisma = makePrisma(makeAlert(), {
      firstName: "Jeanne",
      preferredName: null,
      familyContactPhone: "+33612345678",
    });
    const audit = makeAudit();
    const notifier = makeNotifier({ ok: false, error: "Twilio 401" });
    const service = new AlertService(prisma as any, audit as any, notifier as any);

    const result = await service.create(params);

    // The alert survives a failed notification and stays visible (status created).
    expect(result.status).toBe("created");
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "alert.notification_failed" }),
    );
  });

  it("still creates the alert when the provider throws", async () => {
    const prisma = makePrisma(makeAlert(), {
      firstName: "Jeanne",
      preferredName: null,
      familyContactPhone: "+33612345678",
    });
    const notifier = { name: "twilio", sendSms: vi.fn().mockRejectedValue(new Error("boom")) };
    const service = new AlertService(prisma as any, makeAudit() as any, notifier as any);

    const result = await service.create(params);
    expect(result.status).toBe("created");
  });

  it("does nothing extra when no provider is configured (default)", async () => {
    const prisma = makePrisma(makeAlert());
    const service = new AlertService(prisma as any, makeAudit() as any);

    const result = await service.create(params);

    expect(result.status).toBe("created");
    expect(prisma.resident.findUnique).not.toHaveBeenCalled(); // short-circuits
  });
});

describe("AlertService.getDeliveryStatus", () => {
  it("reports a successful send without leaking the phone or body", async () => {
    const audit = {
      log: vi.fn(),
      findAll: vi.fn().mockResolvedValue([
        {
          action: "alert.notification_sent",
          createdAt: new Date(),
          metadata: { channel: "sms", provider: "twilio", ok: true },
        },
      ]),
    };
    const service = new AlertService(makePrisma(makeAlert()) as any, audit as any);

    const res = await service.getDeliveryStatus("alert-1");

    expect(res.attempted).toBe(true);
    expect(res.attempts[0].ok).toBe(true);
    expect(res.attempts[0].channel).toBe("sms");
    expect(JSON.stringify(res)).not.toMatch(/\+\d{6,}/); // no phone number
  });

  it("surfaces the provider error when the send failed", async () => {
    const audit = {
      log: vi.fn(),
      findAll: vi.fn().mockResolvedValue([
        {
          action: "alert.notification_failed",
          createdAt: new Date(),
          metadata: { channel: "sms", provider: "twilio", ok: false, error: "Twilio 21608" },
        },
      ]),
    };
    const service = new AlertService(makePrisma(makeAlert()) as any, audit as any);

    const res = await service.getDeliveryStatus("alert-1");

    expect(res.attempts[0].ok).toBe(false);
    expect(res.attempts[0].error).toBe("Twilio 21608");
  });

  it("reports attempted=false when nothing was ever sent", async () => {
    const audit = {
      log: vi.fn(),
      findAll: vi.fn().mockResolvedValue([
        { action: "alert.created", createdAt: new Date(), metadata: {} },
      ]),
    };
    const service = new AlertService(makePrisma(makeAlert()) as any, audit as any);

    const res = await service.getDeliveryStatus("alert-1");

    expect(res.attempted).toBe(false);
    expect(res.attempts).toHaveLength(0);
  });
});

describe("buildAlertSms", () => {
  it("never includes medical specifics, always points to the dashboard", () => {
    const msg = buildAlertSms("missed_medication", "Jeanne");
    expect(msg).toContain("Jeanne");
    expect(msg).toContain("tableau de bord");
    expect(msg.toLowerCase()).not.toContain("dose");
  });

  it("uses a distinct wording for wellbeing/emergency", () => {
    expect(buildAlertSms("emergency_phrase", "Jeanne")).toContain("besoin d'aide");
  });
});

describe("AlertService.acknowledge", () => {
  it("sets status to acknowledged and records caregiverId in audit", async () => {
    const alert = makeAlert();
    const prisma = makePrisma(alert);
    const audit = makeAudit();
    const service = new AlertService(prisma as any, audit as any);

    const result = await service.acknowledge("alert-1", "cg-1");

    expect(result.status).toBe("acknowledged");
    expect(result.acknowledgedAt).toBeDefined();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "alert.acknowledged",
        actorId: "cg-1",
      }),
    );
  });

  it("throws NotFoundException for unknown alert", async () => {
    const prisma = makePrisma(null);
    prisma.alert.findUnique.mockResolvedValue(null);
    const service = new AlertService(prisma as any, makeAudit() as any);

    await expect(service.acknowledge("bad-id", "cg-1")).rejects.toThrow(NotFoundException);
  });
});

describe("AlertService.resolve", () => {
  it("sets status to resolved", async () => {
    const alert = makeAlert({ status: "acknowledged" });
    const prisma = makePrisma(alert);
    const audit = makeAudit();
    const service = new AlertService(prisma as any, audit as any);

    const result = await service.resolve("alert-1", "cg-1");

    expect(result.status).toBe("resolved");
    expect(result.resolvedAt).toBeDefined();
  });
});

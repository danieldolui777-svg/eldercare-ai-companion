import { describe, it, expect, beforeEach, vi } from "vitest";
import { AlertService } from "./alert.service";
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

function makePrisma(alert: any) {
  return {
    alert: {
      create: vi.fn().mockResolvedValue(alert),
      findUnique: vi.fn().mockResolvedValue(alert),
      update: vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({ ...alert, ...data }),
      ),
      findMany: vi.fn().mockResolvedValue([alert]),
    },
  };
}

function makeAudit() {
  return { log: vi.fn().mockResolvedValue(undefined) };
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

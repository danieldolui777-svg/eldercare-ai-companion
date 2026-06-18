import { describe, it, expect, beforeEach, vi } from "vitest";
import { SchedulerService } from "./scheduler.service";

function makeSchedule(overrides: Partial<any> = {}) {
  return {
    id: "sched-1",
    residentId: "res-1",
    medicationId: "med-1",
    timeOfDay: "08:00",
    recurrenceRule: "FREQ=DAILY",
    startDate: new Date("2026-01-01"),
    endDate: null,
    active: true,
    ...overrides,
  };
}

function makePrisma(schedules: any[], existingEvent: any = null) {
  return {
    medicationSchedule: {
      findMany: vi.fn().mockResolvedValue(schedules),
    },
    reminderEvent: {
      findFirst: vi.fn().mockResolvedValue(existingEvent),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({ id: "evt-new", ...data }),
      ),
    },
  };
}

function makeAudit() {
  return { log: vi.fn().mockResolvedValue(undefined) };
}

function makeConfirmation() {
  return { markAsMissed: vi.fn().mockResolvedValue({ id: "evt-1", status: "missed" }) };
}

describe("SchedulerService.generateRemindersForDate", () => {
  it("creates one event per active schedule", async () => {
    const prisma = makePrisma([makeSchedule(), makeSchedule({ id: "sched-2" })]);
    const service = new SchedulerService(prisma as any, makeConfirmation() as any, makeAudit() as any);

    const count = await service.generateRemindersForDate(new Date("2026-06-19"));

    expect(count).toBe(2);
    expect(prisma.reminderEvent.create).toHaveBeenCalledTimes(2);
  });

  it("skips a schedule if an event already exists for that date and time", async () => {
    const prisma = makePrisma([makeSchedule()], { id: "existing-evt" });
    const service = new SchedulerService(prisma as any, makeConfirmation() as any, makeAudit() as any);

    const count = await service.generateRemindersForDate(new Date("2026-06-19"));

    expect(count).toBe(0);
    expect(prisma.reminderEvent.create).not.toHaveBeenCalled();
  });

  it("sets scheduledAt to correct hours and minutes from timeOfDay", async () => {
    const prisma = makePrisma([makeSchedule({ timeOfDay: "14:30" })]);
    const service = new SchedulerService(prisma as any, makeConfirmation() as any, makeAudit() as any);

    await service.generateRemindersForDate(new Date("2026-06-19"));

    const createCall = prisma.reminderEvent.create.mock.calls[0][0].data;
    expect(createCall.scheduledAt.getHours()).toBe(14);
    expect(createCall.scheduledAt.getMinutes()).toBe(30);
  });

  it("writes an audit log entry for each created event", async () => {
    const prisma = makePrisma([makeSchedule()]);
    const audit = makeAudit();
    const service = new SchedulerService(prisma as any, makeConfirmation() as any, audit as any);

    await service.generateRemindersForDate(new Date("2026-06-19"));

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "reminderEvent.created" }),
    );
  });
});

describe("SchedulerService.detectMissedReminders", () => {
  it("calls markAsMissed for each overdue event", async () => {
    const overdueEvents = [
      { id: "evt-1", status: "delivered" },
      { id: "evt-2", status: "scheduled" },
    ];
    const prisma = {
      medicationSchedule: { findMany: vi.fn() },
      reminderEvent: {
        findMany: vi.fn().mockResolvedValue(overdueEvents),
        findFirst: vi.fn(),
        create: vi.fn(),
      },
    };
    const confirmation = makeConfirmation();
    const service = new SchedulerService(prisma as any, confirmation as any, makeAudit() as any);

    await service.detectMissedReminders();

    expect(confirmation.markAsMissed).toHaveBeenCalledTimes(2);
    expect(confirmation.markAsMissed).toHaveBeenCalledWith("evt-1");
    expect(confirmation.markAsMissed).toHaveBeenCalledWith("evt-2");
  });

  it("does nothing when no overdue events exist", async () => {
    const prisma = {
      medicationSchedule: { findMany: vi.fn() },
      reminderEvent: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        create: vi.fn(),
      },
    };
    const confirmation = makeConfirmation();
    const service = new SchedulerService(prisma as any, confirmation as any, makeAudit() as any);

    await service.detectMissedReminders();

    expect(confirmation.markAsMissed).not.toHaveBeenCalled();
  });
});

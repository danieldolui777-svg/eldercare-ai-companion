import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class ReminderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createEvent(medicationScheduleId: string, scheduledAt: Date) {
    const schedule = await this.prisma.medicationSchedule.findUniqueOrThrow({
      where: { id: medicationScheduleId },
    });

    const event = await this.prisma.reminderEvent.create({
      data: {
        residentId: schedule.residentId,
        medicationScheduleId,
        scheduledAt,
        status: "scheduled",
      },
    });

    await this.audit.log({
      actorType: "system",
      action: "reminderEvent.created",
      entityType: "ReminderEvent",
      entityId: event.id,
      metadata: { medicationScheduleId, scheduledAt: scheduledAt.toISOString() },
    });

    return event;
  }

  async findForResident(residentId: string) {
    return this.prisma.reminderEvent.findMany({
      where: { residentId },
      include: { medicationSchedule: { include: { medication: true } } },
      orderBy: { scheduledAt: "desc" },
      take: 50,
    });
  }

  async findPendingBefore(cutoff: Date) {
    return this.prisma.reminderEvent.findMany({
      where: {
        scheduledAt: { lte: cutoff },
        status: { in: ["scheduled", "delivered"] },
      },
      include: { medicationSchedule: { include: { medication: true } } },
    });
  }
}

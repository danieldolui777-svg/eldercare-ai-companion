import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { ReminderConfirmationService } from "../reminder/reminder-confirmation.service";
import { AuditService } from "../audit/audit.service";

const MISSED_AFTER_MINUTES = 15;

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly confirmationService: ReminderConfirmationService,
    private readonly audit: AuditService,
  ) {}

  // Runs every night at 01:00 — generates reminder events for the next day
  @Cron("0 1 * * *")
  async generateDailyReminders() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const count = await this.generateRemindersForDate(tomorrow);
    this.logger.log(`Generated ${count} reminder events for ${tomorrow.toDateString()}`);
  }

  // Runs every 5 minutes — marks delivered events with no response as missed
  @Cron("*/5 * * * *")
  async detectMissedReminders() {
    const cutoff = new Date(Date.now() - MISSED_AFTER_MINUTES * 60 * 1000);

    const overdueEvents = await this.prisma.reminderEvent.findMany({
      where: {
        status: { in: ["scheduled", "delivered"] },
        scheduledAt: { lte: cutoff },
      },
    });

    if (overdueEvents.length === 0) return;

    this.logger.log(`Marking ${overdueEvents.length} overdue event(s) as missed`);

    for (const event of overdueEvents) {
      await this.confirmationService.markAsMissed(event.id);
    }
  }

  // Called manually to seed events for today (useful for testing)
  async generateRemindersForDate(date: Date): Promise<number> {
    const dateStr = date.toISOString().slice(0, 10);

    const schedules = await this.prisma.medicationSchedule.findMany({
      where: {
        active: true,
        startDate: { lte: date },
        OR: [{ endDate: null }, { endDate: { gte: date } }],
      },
    });

    let created = 0;

    for (const schedule of schedules) {
      const [hours, minutes] = schedule.timeOfDay.split(":").map(Number);
      const scheduledAt = new Date(dateStr);
      scheduledAt.setHours(hours, minutes, 0, 0);

      const existing = await this.prisma.reminderEvent.findFirst({
        where: {
          medicationScheduleId: schedule.id,
          scheduledAt,
        },
      });

      if (existing) continue;

      await this.prisma.reminderEvent.create({
        data: {
          residentId: schedule.residentId,
          medicationScheduleId: schedule.id,
          scheduledAt,
          status: "scheduled",
        },
      });

      await this.audit.log({
        actorType: "system",
        action: "reminderEvent.created",
        entityType: "ReminderEvent",
        metadata: {
          medicationScheduleId: schedule.id,
          scheduledAt: scheduledAt.toISOString(),
          source: "daily-scheduler",
        },
      });

      created++;
    }

    return created;
  }
}

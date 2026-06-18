import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AlertService } from "../alert/alert.service";
import {
  ConfirmReminder,
  ReminderStatus,
  STATUSES_REQUIRING_ALERT,
} from "@eldercare/domain";

const TERMINAL_STATUSES: Set<ReminderStatus> = new Set([
  "confirmed_taken",
  "confirmed_not_taken",
  "unknown",
  "missed",
  "escalated",
]);

@Injectable()
export class ReminderConfirmationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly alertService: AlertService,
  ) {}

  async confirm(eventId: string, input: ConfirmReminder) {
    const event = await this.prisma.reminderEvent.findUnique({
      where: { id: eventId },
      include: { medicationSchedule: { include: { medication: true } } },
    });

    if (!event) throw new NotFoundException(`ReminderEvent ${eventId} not found`);

    if (TERMINAL_STATUSES.has(event.status as ReminderStatus)) {
      throw new BadRequestException(
        `ReminderEvent ${eventId} is already in terminal status: ${event.status}`,
      );
    }

    const updated = await this.prisma.reminderEvent.update({
      where: { id: eventId },
      data: {
        status: input.status,
        confirmationSource: input.confirmationSource,
        transcriptSnippet: input.transcriptSnippet,
        deliveredAt: event.deliveredAt ?? new Date(),
      },
    });

    await this.audit.log({
      actorType: input.confirmationSource === "voice" ? "resident" : "caregiver",
      action: "reminderEvent.confirmed",
      entityType: "ReminderEvent",
      entityId: eventId,
      metadata: {
        status: input.status,
        source: input.confirmationSource,
        residentId: event.residentId,
      },
    });

    if (STATUSES_REQUIRING_ALERT.has(input.status)) {
      await this.createAlertForStatus(event, input);
    }

    return updated;
  }

  private async createAlertForStatus(
    event: any,
    input: ConfirmReminder,
  ) {
    const medName = event.medicationSchedule?.medication?.name ?? "medication";

    const typeMap: Record<string, "missed_medication" | "medication_uncertainty"> = {
      missed: "missed_medication",
      confirmed_not_taken: "missed_medication",
      unknown: "medication_uncertainty",
    };

    const severityMap: Record<string, "medium" | "high"> = {
      missed: "high",
      confirmed_not_taken: "medium",
      unknown: "medium",
    };

    await this.alertService.create({
      residentId: event.residentId,
      type: typeMap[input.status] ?? "other",
      severity: severityMap[input.status] ?? "medium",
      message: this.buildAlertMessage(input.status, medName),
    });
  }

  private buildAlertMessage(status: string, medName: string): string {
    switch (status) {
      case "missed":
        return `Reminder for ${medName} was not acknowledged — no response from resident.`;
      case "confirmed_not_taken":
        return `Resident confirmed they did not take ${medName}.`;
      case "unknown":
        return `Resident is uncertain whether they took ${medName}.`;
      default:
        return `Medication reminder for ${medName} requires attention (status: ${status}).`;
    }
  }

  async markAsDelivered(eventId: string) {
    const event = await this.prisma.reminderEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException(`ReminderEvent ${eventId} not found`);

    return this.prisma.reminderEvent.update({
      where: { id: eventId },
      data: { status: "delivered", deliveredAt: new Date() },
    });
  }

  async markAsMissed(eventId: string) {
    const event = await this.prisma.reminderEvent.findUnique({
      where: { id: eventId },
      include: { medicationSchedule: { include: { medication: true } } },
    });
    if (!event) throw new NotFoundException(`ReminderEvent ${eventId} not found`);

    if (TERMINAL_STATUSES.has(event.status as ReminderStatus)) return event;

    const updated = await this.prisma.reminderEvent.update({
      where: { id: eventId },
      data: { status: "missed" },
    });

    await this.audit.log({
      actorType: "system",
      action: "reminderEvent.missed",
      entityType: "ReminderEvent",
      entityId: eventId,
      metadata: { residentId: event.residentId },
    });

    const medName = event.medicationSchedule?.medication?.name ?? "medication";
    await this.alertService.create({
      residentId: event.residentId,
      type: "missed_medication",
      severity: "high",
      message: `Reminder for ${medName} was not acknowledged — no response from resident.`,
    });

    return updated;
  }
}

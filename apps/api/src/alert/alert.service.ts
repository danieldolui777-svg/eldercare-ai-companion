import {
  Injectable,
  NotFoundException,
  Optional,
  Inject,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AlertType, AlertSeverity } from "@eldercare/domain";
import type { NotificationProvider } from "@eldercare/ai-providers";
import { NOTIFICATION_PROVIDER } from "./notification.token";

export interface CreateAlertParams {
  residentId: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  assignedToCaregiverId?: string;
}

@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    // Optional: absent until the host configures Twilio. When undefined, alerts
    // are still created and audited — they just aren't texted to anyone.
    @Optional()
    @Inject(NOTIFICATION_PROVIDER)
    private readonly notifier?: NotificationProvider,
  ) {}

  async create(params: CreateAlertParams) {
    const alert = await this.prisma.alert.create({
      data: {
        residentId: params.residentId,
        type: params.type,
        severity: params.severity,
        status: "created",
        message: params.message,
        assignedToCaregiverId: params.assignedToCaregiverId,
      },
    });
    await this.audit.log({
      actorType: "system",
      action: "alert.created",
      entityType: "Alert",
      entityId: alert.id,
      metadata: { type: params.type, severity: params.severity },
    });

    // Step 2 of the emergency cascade: text the resident's emergency contact.
    // Best-effort and fully isolated — a notification failure must never undo
    // or hide the alert (the alert stays status "created", never "failed", so
    // it always remains visible on the caregiver dashboard's active list).
    await this.notifyEmergencyContact(alert.id, params).catch((err) => {
      this.logger.warn(`Alert ${alert.id} notification error: ${err?.message}`);
    });

    return alert;
  }

  private async notifyEmergencyContact(alertId: string, params: CreateAlertParams) {
    if (!this.notifier) return; // no channel configured

    const resident = await this.prisma.resident.findUnique({
      where: { id: params.residentId },
      select: { firstName: true, preferredName: true, familyContactPhone: true },
    });
    const phone = resident?.familyContactPhone;
    if (!phone) return; // no emergency contact number on file

    const name = resident?.preferredName || resident?.firstName || "un résident";
    const body = buildAlertSms(params.type, name);

    const result = await this.notifier.sendSms({ to: phone, body });
    await this.audit
      .log({
        actorType: "system",
        action: result.ok ? "alert.notification_sent" : "alert.notification_failed",
        entityType: "Alert",
        entityId: alertId,
        // Never log the phone number or message body — audit stays metadata-only.
        metadata: { channel: "sms", provider: this.notifier.name, ok: result.ok, error: result.error },
      })
      .catch(() => undefined);
  }

  async acknowledge(id: string, caregiverId: string) {
    const alert = await this.prisma.alert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundException(`Alert ${id} not found`);

    const updated = await this.prisma.alert.update({
      where: { id },
      data: { status: "acknowledged", acknowledgedAt: new Date() },
    });
    await this.audit.log({
      actorType: "caregiver",
      actorId: caregiverId,
      action: "alert.acknowledged",
      entityType: "Alert",
      entityId: id,
    });
    return updated;
  }

  async resolve(id: string, caregiverId: string) {
    const alert = await this.prisma.alert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundException(`Alert ${id} not found`);

    const updated = await this.prisma.alert.update({
      where: { id },
      data: { status: "resolved", resolvedAt: new Date() },
    });
    await this.audit.log({
      actorType: "caregiver",
      actorId: caregiverId,
      action: "alert.resolved",
      entityType: "Alert",
      entityId: id,
    });
    return updated;
  }

  async findForResident(residentId: string) {
    return this.prisma.alert.findMany({
      where: { residentId },
      orderBy: { createdAt: "desc" },
    });
  }

  async findActive() {
    return this.prisma.alert.findMany({
      where: { status: { in: ["created", "sent"] } },
      orderBy: [{ severity: "desc" }, { createdAt: "asc" }],
      include: { resident: true },
    });
  }
}

/**
 * The SMS text sent to an emergency contact. Deliberately MINIMAL and free of
 * any medical specifics (no medication names, no dosage) — data minimisation
 * per the project's data-boundary rules. It tells the contact that attention is
 * needed and to open the dashboard; it never diagnoses or discloses details.
 */
export function buildAlertSms(type: AlertType, residentName: string): string {
  const tail = " Connectez-vous au tableau de bord Eldercare pour en savoir plus.";
  switch (type) {
    case "missed_medication":
    case "medication_uncertainty":
      return `Eldercare : un rappel concernant ${residentName} n'a pas été confirmé.${tail}`;
    case "emergency_phrase":
    case "wellbeing_concern":
      return `Eldercare : ${residentName} pourrait avoir besoin d'aide.${tail}`;
    case "device_offline":
      return `Eldercare : l'appareil de ${residentName} semble hors ligne.${tail}`;
    default:
      return `Eldercare : nouvelle alerte concernant ${residentName}.${tail}`;
  }
}

import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AlertType, AlertSeverity } from "@eldercare/domain";

export interface CreateAlertParams {
  residentId: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  assignedToCaregiverId?: string;
}

@Injectable()
export class AlertService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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
    return alert;
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

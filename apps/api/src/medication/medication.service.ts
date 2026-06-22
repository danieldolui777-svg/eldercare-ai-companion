import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import {
  CreateMedication,
  UpdateMedication,
  CreateMedicationSchedule,
  UpdateMedicationSchedule,
} from "@eldercare/domain";

@Injectable()
export class MedicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAllForResident(residentId: string) {
    return this.prisma.medication.findMany({
      where: { residentId },
      include: { schedules: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(id: string) {
    const med = await this.prisma.medication.findUnique({
      where: { id },
      include: { schedules: true },
    });
    if (!med) throw new NotFoundException(`Medication ${id} not found`);
    return med;
  }

  async create(data: CreateMedication) {
    const med = await this.prisma.medication.create({ data: data as any });
    await this.audit.log({
      actorType: "system",
      action: "medication.created",
      entityType: "Medication",
      entityId: med.id,
      metadata: { residentId: data.residentId, name: data.name },
    });
    return med;
  }

  async update(id: string, data: UpdateMedication) {
    await this.findOne(id);
    const updated = await this.prisma.medication.update({ where: { id }, data });
    await this.audit.log({
      actorType: "system",
      action: "medication.updated",
      entityType: "Medication",
      entityId: id,
    });
    return updated;
  }

  async createSchedule(data: CreateMedicationSchedule) {
    const schedule = await this.prisma.medicationSchedule.create({ data: data as any });
    await this.audit.log({
      actorType: "system",
      action: "medicationSchedule.created",
      entityType: "MedicationSchedule",
      entityId: schedule.id,
      metadata: { medicationId: data.medicationId, timeOfDay: data.timeOfDay },
    });
    return schedule;
  }

  async updateSchedule(id: string, data: UpdateMedicationSchedule) {
    const schedule = await this.prisma.medicationSchedule.findUnique({ where: { id } });
    if (!schedule) throw new NotFoundException(`Schedule ${id} not found`);
    const updated = await this.prisma.medicationSchedule.update({ where: { id }, data });
    await this.audit.log({
      actorType: "system",
      action: "medicationSchedule.updated",
      entityType: "MedicationSchedule",
      entityId: id,
    });
    return updated;
  }

  async findSchedulesForResident(residentId: string) {
    return this.prisma.medicationSchedule.findMany({
      where: { residentId, active: true },
      include: { medication: true },
      orderBy: { timeOfDay: "asc" },
    });
  }
}

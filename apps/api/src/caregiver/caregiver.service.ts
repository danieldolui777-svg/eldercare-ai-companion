import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CreateCaregiver, UpdateCaregiver } from "@eldercare/domain";

@Injectable()
export class CaregiverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll() {
    return this.prisma.caregiver.findMany({ orderBy: { name: "asc" } });
  }

  async findOne(id: string) {
    const c = await this.prisma.caregiver.findUnique({ where: { id } });
    if (!c) throw new NotFoundException(`Caregiver ${id} not found`);
    return c;
  }

  async create(data: CreateCaregiver) {
    const c = await this.prisma.caregiver.create({ data: data as any });
    await this.audit.log({
      actorType: "system",
      action: "caregiver.created",
      entityType: "Caregiver",
      entityId: c.id,
    });
    return c;
  }

  async update(id: string, data: UpdateCaregiver) {
    await this.findOne(id);
    const updated = await this.prisma.caregiver.update({ where: { id }, data: data as any });
    await this.audit.log({
      actorType: "system",
      action: "caregiver.updated",
      entityType: "Caregiver",
      entityId: id,
    });
    return updated;
  }
}

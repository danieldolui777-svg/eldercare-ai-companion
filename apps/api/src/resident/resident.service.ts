import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CreateResident, UpdateResident } from "@eldercare/domain";

@Injectable()
export class ResidentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll() {
    return this.prisma.resident.findMany({ orderBy: { createdAt: "desc" } });
  }

  async findOne(id: string) {
    const resident = await this.prisma.resident.findUnique({ where: { id } });
    if (!resident) throw new NotFoundException(`Resident ${id} not found`);
    return resident;
  }

  async create(data: CreateResident) {
    const resident = await this.prisma.resident.create({ data: data as any });
    await this.audit.log({
      actorType: "system",
      action: "resident.created",
      entityType: "Resident",
      entityId: resident.id,
    });
    return resident;
  }

  async update(id: string, data: UpdateResident) {
    await this.findOne(id);
    const updated = await this.prisma.resident.update({
      where: { id },
      data: data as any,
    });
    await this.audit.log({
      actorType: "system",
      action: "resident.updated",
      entityType: "Resident",
      entityId: id,
      metadata: { fields: Object.keys(data) },
    });
    return updated;
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.resident.delete({ where: { id } });
    await this.audit.log({
      actorType: "system",
      action: "resident.deleted",
      entityType: "Resident",
      entityId: id,
    });
  }
}

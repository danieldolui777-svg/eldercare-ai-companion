import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { z } from "zod";
import { DeviceService } from "./device.service";
import { PrismaService } from "../prisma/prisma.service";
import { ZodPipe } from "../common/zod.pipe";
import { DeviceRoute, DeviceResidentId } from "./device.decorators";

const CreateDeviceSchema = z.object({ label: z.string().optional() });

@Controller()
export class DeviceController {
  constructor(
    private readonly devices: DeviceService,
    private readonly prisma: PrismaService,
  ) {}

  // ── Caregiver-facing (protected by the global JWT guard) ────────────────────

  /** Pair a new device to a resident. Returns the raw token ONCE. */
  @Post("residents/:residentId/devices")
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param("residentId") residentId: string,
    @Body(new ZodPipe(CreateDeviceSchema)) body: any,
  ) {
    return this.devices.createToken(residentId, body.label);
  }

  @Get("residents/:residentId/devices")
  list(@Param("residentId") residentId: string) {
    return this.devices.listForResident(residentId);
  }

  @Post("devices/:id/revoke")
  @HttpCode(HttpStatus.OK)
  revoke(@Param("id") id: string) {
    return this.devices.revoke(id);
  }

  // ── Device-facing (X-Device-Token) ──────────────────────────────────────────

  /** The resident this device is bound to (name + language for the UI). */
  @DeviceRoute()
  @Get("device/me")
  me(@DeviceResidentId() residentId: string) {
    return this.prisma.resident.findUnique({
      where: { id: residentId },
      select: { id: true, firstName: true, preferredName: true, language: true },
    });
  }

  /** Reminders for THIS device's resident (used by the standby/reminder loop). */
  @DeviceRoute()
  @Get("device/reminders")
  reminders(@DeviceResidentId() residentId: string) {
    return this.prisma.reminderEvent.findMany({
      where: { residentId },
      orderBy: { scheduledAt: "desc" },
      take: 20,
      include: { medicationSchedule: { include: { medication: true } } },
    });
  }
}

import { Controller, Get, Post, Put, Param, Body } from "@nestjs/common";
import { MedicationService } from "./medication.service";
import {
  CreateMedicationSchema,
  UpdateMedicationSchema,
  CreateMedicationScheduleSchema,
  UpdateMedicationScheduleSchema,
} from "@eldercare/domain";
import { ZodPipe } from "../common/zod.pipe";

@Controller()
export class MedicationController {
  constructor(private readonly service: MedicationService) {}

  @Get("residents/:residentId/medications")
  findAll(@Param("residentId") residentId: string) {
    return this.service.findAllForResident(residentId);
  }

  @Post("medications")
  create(@Body(new ZodPipe(CreateMedicationSchema)) body: any) {
    return this.service.create(body);
  }

  @Put("medications/:id")
  update(
    @Param("id") id: string,
    @Body(new ZodPipe(UpdateMedicationSchema)) body: any,
  ) {
    return this.service.update(id, body);
  }

  @Get("residents/:residentId/schedules")
  findSchedules(@Param("residentId") residentId: string) {
    return this.service.findSchedulesForResident(residentId);
  }

  @Post("medication-schedules")
  createSchedule(@Body(new ZodPipe(CreateMedicationScheduleSchema)) body: any) {
    return this.service.createSchedule(body);
  }

  @Put("medication-schedules/:id")
  updateSchedule(
    @Param("id") id: string,
    @Body(new ZodPipe(UpdateMedicationScheduleSchema)) body: any,
  ) {
    return this.service.updateSchedule(id, body);
  }
}

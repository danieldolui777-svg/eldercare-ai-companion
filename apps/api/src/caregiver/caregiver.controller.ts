import { Controller, Get, Post, Put, Param, Body } from "@nestjs/common";
import { CaregiverService } from "./caregiver.service";
import { CreateCaregiverSchema, UpdateCaregiverSchema } from "@eldercare/domain";
import { ZodPipe } from "../common/zod.pipe";

@Controller("caregivers")
export class CaregiverController {
  constructor(private readonly service: CaregiverService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body(new ZodPipe(CreateCaregiverSchema)) body: any) {
    return this.service.create(body);
  }

  @Put(":id")
  update(
    @Param("id") id: string,
    @Body(new ZodPipe(UpdateCaregiverSchema)) body: any,
  ) {
    return this.service.update(id, body);
  }
}

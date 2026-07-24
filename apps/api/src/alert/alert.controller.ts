import { Controller, Get, Post, Param, Body, HttpCode, HttpStatus } from "@nestjs/common";
import { AlertService, CreateAlertParams } from "./alert.service";

@Controller("alerts")
export class AlertController {
  constructor(private readonly service: AlertService) {}

  @Get()
  findActive() {
    return this.service.findActive();
  }

  @Get("resident/:residentId")
  findForResident(@Param("residentId") residentId: string) {
    return this.service.findForResident(residentId);
  }

  /** Whether the emergency contact was actually reached (SMS sent / failed). */
  @Get(":id/delivery")
  delivery(@Param("id") id: string) {
    return this.service.getDeliveryStatus(id);
  }

  @Post(":id/acknowledge")
  @HttpCode(HttpStatus.OK)
  acknowledge(
    @Param("id") id: string,
    @Body("caregiverId") caregiverId: string,
  ) {
    return this.service.acknowledge(id, caregiverId);
  }

  @Post(":id/resolve")
  @HttpCode(HttpStatus.OK)
  resolve(
    @Param("id") id: string,
    @Body("caregiverId") caregiverId: string,
  ) {
    return this.service.resolve(id, caregiverId);
  }
}

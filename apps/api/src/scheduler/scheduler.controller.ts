import { Controller, Post, Body, HttpCode, HttpStatus } from "@nestjs/common";
import { SchedulerService } from "./scheduler.service";

@Controller("scheduler")
export class SchedulerController {
  constructor(private readonly service: SchedulerService) {}

  // Trigger daily generation manually (for testing / backfill)
  @Post("generate")
  @HttpCode(HttpStatus.OK)
  async generate(@Body("date") dateStr?: string) {
    const date = dateStr ? new Date(dateStr) : new Date();
    const count = await this.service.generateRemindersForDate(date);
    return { generated: count, date: date.toISOString().slice(0, 10) };
  }

  // Trigger missed-detection manually (for testing)
  @Post("detect-missed")
  @HttpCode(HttpStatus.OK)
  async detectMissed(@Body() _body?: unknown) {
    await this.service.detectMissedReminders();
    return { ok: true };
  }
}

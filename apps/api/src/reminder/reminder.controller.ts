import { Controller, Get, Post, Param, Body, HttpCode, HttpStatus } from "@nestjs/common";
import { z } from "zod";
import { ReminderService } from "./reminder.service";
import { ReminderConfirmationService } from "./reminder-confirmation.service";
import { ConfirmReminderSchema } from "@eldercare/domain";
import { ZodPipe } from "../common/zod.pipe";

const MockVoiceConfirmSchema = z.object({
  eventId: z.string().uuid(),
  status: z.enum(["confirmed_taken", "confirmed_not_taken", "unknown", "missed"]),
  transcriptSnippet: z.string().optional(),
});

@Controller()
export class ReminderController {
  constructor(
    private readonly reminderService: ReminderService,
    private readonly confirmationService: ReminderConfirmationService,
  ) {}

  @Get("residents/:residentId/reminders")
  findForResident(@Param("residentId") residentId: string) {
    return this.reminderService.findForResident(residentId);
  }

  @Post("reminder-events/:id/confirm")
  @HttpCode(HttpStatus.OK)
  confirm(
    @Param("id") id: string,
    @Body(new ZodPipe(ConfirmReminderSchema)) body: any,
  ) {
    return this.confirmationService.confirm(id, body);
  }

  @Post("reminder-events/:id/deliver")
  @HttpCode(HttpStatus.OK)
  markDelivered(@Param("id") id: string) {
    return this.confirmationService.markAsDelivered(id);
  }

  // Creates a reminder event manually (used for testing; Phase 2 will use a scheduler)
  @Post("reminder-events")
  createEvent(
    @Body() body: { medicationScheduleId: string; scheduledAt: string },
  ) {
    return this.reminderService.createEvent(
      body.medicationScheduleId,
      new Date(body.scheduledAt),
    );
  }

  // Simulates a voice confirmation without a real AI/voice provider
  @Post("voice-events/confirm")
  @HttpCode(HttpStatus.OK)
  mockVoiceConfirm(@Body(new ZodPipe(MockVoiceConfirmSchema)) body: any) {
    return this.confirmationService.confirm(body.eventId, {
      status: body.status,
      confirmationSource: "voice",
      transcriptSnippet: body.transcriptSnippet,
    });
  }
}

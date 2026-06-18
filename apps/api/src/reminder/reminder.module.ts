import { Module } from "@nestjs/common";
import { ReminderService } from "./reminder.service";
import { ReminderConfirmationService } from "./reminder-confirmation.service";
import { ReminderController } from "./reminder.controller";
import { AlertModule } from "../alert/alert.module";

@Module({
  imports: [AlertModule],
  controllers: [ReminderController],
  providers: [ReminderService, ReminderConfirmationService],
  exports: [ReminderService, ReminderConfirmationService],
})
export class ReminderModule {}

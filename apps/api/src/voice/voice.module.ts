import { Module } from "@nestjs/common";
import { VoiceController } from "./voice.controller";
import { VoiceService } from "./voice.service";
import { ReminderModule } from "../reminder/reminder.module";

@Module({
  imports: [ReminderModule],
  controllers: [VoiceController],
  providers: [VoiceService],
})
export class VoiceModule {}

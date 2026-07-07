import { Module } from "@nestjs/common";
import { VoiceController } from "./voice.controller";
import { VoiceService } from "./voice.service";
import { ReminderModule } from "../reminder/reminder.module";
import { MemoryModule } from "../memory/memory.module";

@Module({
  imports: [ReminderModule, MemoryModule],
  controllers: [VoiceController],
  providers: [VoiceService],
})
export class VoiceModule {}

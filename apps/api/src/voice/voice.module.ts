import { Module } from "@nestjs/common";
import { VoiceController } from "./voice.controller";
import { VoiceService } from "./voice.service";
import { ReminderModule } from "../reminder/reminder.module";
import { MemoryModule } from "../memory/memory.module";
import { AlertModule } from "../alert/alert.module";

@Module({
  imports: [ReminderModule, MemoryModule, AlertModule],
  controllers: [VoiceController],
  providers: [VoiceService],
})
export class VoiceModule {}

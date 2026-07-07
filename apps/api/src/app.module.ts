import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { PrismaModule } from "./prisma/prisma.module";
import { AuditModule } from "./audit/audit.module";
import { ResidentModule } from "./resident/resident.module";
import { CaregiverModule } from "./caregiver/caregiver.module";
import { MedicationModule } from "./medication/medication.module";
import { ReminderModule } from "./reminder/reminder.module";
import { AlertModule } from "./alert/alert.module";
import { SchedulerModule } from "./scheduler/scheduler.module";
import { VoiceModule } from "./voice/voice.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { MemoryModule } from "./memory/memory.module";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditModule,
    ResidentModule,
    CaregiverModule,
    MedicationModule,
    ReminderModule,
    AlertModule,
    SchedulerModule,
    VoiceModule,
    RealtimeModule,
    MemoryModule,
  ],
})
export class AppModule {}

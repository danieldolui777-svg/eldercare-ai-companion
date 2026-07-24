import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AuditModule } from "../audit/audit.module";
import { MemoryModule } from "../memory/memory.module";
import { AlertModule } from "../alert/alert.module";
import { RealtimeHandler } from "./realtime.handler";

@Module({
  imports: [PrismaModule, AuditModule, MemoryModule, AlertModule],
  providers: [RealtimeHandler],
  exports: [RealtimeHandler],
})
export class RealtimeModule {}

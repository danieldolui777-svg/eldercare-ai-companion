import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AuditModule } from "../audit/audit.module";
import { RealtimeHandler } from "./realtime.handler";

@Module({
  imports: [PrismaModule, AuditModule],
  providers: [RealtimeHandler],
  exports: [RealtimeHandler],
})
export class RealtimeModule {}

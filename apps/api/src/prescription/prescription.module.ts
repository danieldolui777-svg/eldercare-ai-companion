import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { PrescriptionService } from "./prescription.service";
import { PrescriptionController } from "./prescription.controller";

@Module({
  imports: [AuditModule],
  controllers: [PrescriptionController],
  providers: [PrescriptionService],
})
export class PrescriptionModule {}

import { Module } from "@nestjs/common";
import { CaregiverService } from "./caregiver.service";
import { CaregiverController } from "./caregiver.controller";

@Module({
  controllers: [CaregiverController],
  providers: [CaregiverService],
  exports: [CaregiverService],
})
export class CaregiverModule {}

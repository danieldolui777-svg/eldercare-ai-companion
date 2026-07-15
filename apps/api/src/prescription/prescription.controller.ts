import { Controller, Post, Body, HttpCode, HttpStatus } from "@nestjs/common";
import { z } from "zod";
import { PrescriptionService } from "./prescription.service";
import { ZodPipe } from "../common/zod.pipe";

const ScanSchema = z.object({
  residentId: z.string().optional(),
  imageBase64: z.string().min(1),
  mimeType: z.string().min(1),
  language: z.enum(["fr", "en"]).optional(),
});

@Controller("prescriptions")
export class PrescriptionController {
  constructor(private readonly service: PrescriptionService) {}

  // Caregiver-authenticated (global guard). Returns a DRAFT only — no DB write.
  @Post("scan")
  @HttpCode(HttpStatus.OK)
  scan(@Body(new ZodPipe(ScanSchema)) body: any) {
    return this.service.scan(body);
  }
}

import { Controller, Post, Body, HttpCode, HttpStatus } from "@nestjs/common";
import { z } from "zod";
import { VoiceService } from "./voice.service";
import { ZodPipe } from "../common/zod.pipe";

const ConverseSchema = z.object({
  residentId: z.string().min(1),
  audioBase64: z.string().min(1),
  mimeType: z.string().min(1),
  language: z.enum(["fr", "en"]).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string(),
      }),
    )
    .optional(),
});

@Controller()
export class VoiceController {
  constructor(private readonly voiceService: VoiceService) {}

  // One conversational turn: send recorded audio, get back transcript,
  // the companion's reply text, and the reply spoken as audio (base64).
  @Post("voice/converse")
  @HttpCode(HttpStatus.OK)
  converse(@Body(new ZodPipe(ConverseSchema)) body: any) {
    return this.voiceService.converse(body);
  }
}

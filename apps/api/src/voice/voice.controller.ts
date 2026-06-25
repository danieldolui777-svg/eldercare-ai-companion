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

const AnnounceSchema = z.object({
  residentId: z.string().min(1),
  reminderId: z.string().min(1),
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

  // Proactive reminder: the device calls this at the scheduled time to get the
  // spoken announcement ("it's time to take your X") for a due reminder.
  @Post("voice/announce")
  @HttpCode(HttpStatus.OK)
  announce(@Body(new ZodPipe(AnnounceSchema)) body: any) {
    return this.voiceService.announce(body);
  }
}

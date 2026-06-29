import { Controller, Post, Body, HttpCode, HttpStatus } from "@nestjs/common";
import { z } from "zod";
import { VoiceService } from "./voice.service";
import { ZodPipe } from "../common/zod.pipe";

const HistorySchema = z.array(
  z.object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string(),
  }),
).optional();

const ConverseSchema = z.object({
  residentId: z.string().min(1),
  audioBase64: z.string().min(1),
  mimeType: z.string().min(1),
  language: z.enum(["fr", "en"]).optional(),
  history: HistorySchema,
});

const ChatTextSchema = z.object({
  residentId: z.string().min(1),
  text: z.string().min(1),
  language: z.enum(["fr", "en"]).optional(),
  history: HistorySchema,
});

const AnnounceSchema = z.object({
  residentId: z.string().min(1),
  reminderId: z.string().min(1),
});

@Controller()
export class VoiceController {
  constructor(private readonly voiceService: VoiceService) {}

  @Post("voice/converse")
  @HttpCode(HttpStatus.OK)
  converse(@Body(new ZodPipe(ConverseSchema)) body: any) {
    return this.voiceService.converse(body);
  }

  // Text-based turn: client already has the transcript (Web Speech API wake-word
  // flow), so we skip Whisper and go straight to GPT + TTS.
  @Post("voice/chat")
  @HttpCode(HttpStatus.OK)
  chatText(@Body(new ZodPipe(ChatTextSchema)) body: any) {
    return this.voiceService.chatText(body);
  }

  @Post("voice/announce")
  @HttpCode(HttpStatus.OK)
  announce(@Body(new ZodPipe(AnnounceSchema)) body: any) {
    return this.voiceService.announce(body);
  }
}

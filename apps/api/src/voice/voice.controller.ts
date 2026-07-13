import { Controller, Post, Body, HttpCode, HttpStatus } from "@nestjs/common";
import { z } from "zod";
import { VoiceService } from "./voice.service";
import { ZodPipe } from "../common/zod.pipe";
import { DeviceRoute, DeviceResidentId } from "../device/device.decorators";

const HistorySchema = z.array(
  z.object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string(),
  }),
).optional();

// residentId normally comes from the device token; it is only read from the body
// as a fallback in open mode (AUTH_DISABLED), hence optional here.
const ConverseSchema = z.object({
  residentId: z.string().min(1).optional(),
  audioBase64: z.string().min(1),
  mimeType: z.string().min(1),
  language: z.enum(["fr", "en"]).optional(),
  history: HistorySchema,
});

const ChatTextSchema = z.object({
  residentId: z.string().min(1).optional(),
  text: z.string().min(1),
  language: z.enum(["fr", "en"]).optional(),
  history: HistorySchema,
});

const AnnounceSchema = z.object({
  residentId: z.string().min(1).optional(),
  reminderId: z.string().min(1),
});

// All voice routes are device-authenticated. The resident id ALWAYS comes from
// the device token (via @DeviceResidentId) — never trusted from the body — so a
// paired device can only ever act for the resident it is bound to.
@Controller()
export class VoiceController {
  constructor(private readonly voiceService: VoiceService) {}

  @DeviceRoute()
  @Post("voice/converse")
  @HttpCode(HttpStatus.OK)
  converse(
    @Body(new ZodPipe(ConverseSchema)) body: any,
    @DeviceResidentId() residentId?: string,
  ) {
    return this.voiceService.converse({ ...body, residentId: residentId ?? body.residentId });
  }

  // Text-based turn: client already has the transcript (Web Speech API wake-word
  // flow), so we skip Whisper and go straight to GPT + TTS.
  @DeviceRoute()
  @Post("voice/chat")
  @HttpCode(HttpStatus.OK)
  chatText(
    @Body(new ZodPipe(ChatTextSchema)) body: any,
    @DeviceResidentId() residentId?: string,
  ) {
    return this.voiceService.chatText({ ...body, residentId: residentId ?? body.residentId });
  }

  @DeviceRoute()
  @Post("voice/announce")
  @HttpCode(HttpStatus.OK)
  announce(
    @Body(new ZodPipe(AnnounceSchema)) body: any,
    @DeviceResidentId() residentId?: string,
  ) {
    return this.voiceService.announce({ ...body, residentId: residentId ?? body.residentId });
  }

  // Creates an immediate test reminder for the device's resident.
  @DeviceRoute()
  @Post("voice/test-reminder")
  @HttpCode(HttpStatus.OK)
  testReminder(
    @Body() body: any,
    @DeviceResidentId() residentId?: string,
  ) {
    return this.voiceService.createTestReminder(residentId ?? body?.residentId);
  }
}

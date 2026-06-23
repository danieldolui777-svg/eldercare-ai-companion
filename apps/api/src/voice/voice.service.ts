import { Injectable, Logger } from "@nestjs/common";
import {
  OpenAiSpeechProvider,
  OpenAiCompanionChatProvider,
  type ChatMessage,
} from "@eldercare/ai-providers";
import { AuditService } from "../audit/audit.service";

export interface ConverseInput {
  residentId: string;
  audioBase64: string;
  mimeType: string;
  language?: "fr" | "en";
  history?: ChatMessage[];
}

export interface ConverseResult {
  transcript: string;
  reply: string;
  audioBase64: string;
  audioMimeType: string;
}

/**
 * Orchestrates one conversational turn for the voice companion:
 *   audio in -> transcribe (ears) -> chat (brain) -> synthesize (voice) -> audio out.
 *
 * The deterministic backend stays the source of truth for medication and
 * alerts; this service only handles natural-language companionship. Raw audio
 * is never persisted — only conversation metadata is written to the audit log.
 */
@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  private readonly speech: OpenAiSpeechProvider;
  private readonly chat: OpenAiCompanionChatProvider;
  private readonly configured: boolean;

  constructor(private readonly audit: AuditService) {
    const apiKey = process.env.OPENAI_API_KEY ?? "";
    this.configured = apiKey.length > 0;
    if (!this.configured) {
      this.logger.warn(
        "OPENAI_API_KEY is not set — the voice endpoint will return an error until it is configured.",
      );
    }
    this.speech = new OpenAiSpeechProvider({ apiKey });
    this.chat = new OpenAiCompanionChatProvider({ apiKey });
  }

  async converse(input: ConverseInput): Promise<ConverseResult> {
    if (!this.configured) {
      throw new Error("Voice companion is not configured (missing OPENAI_API_KEY).");
    }

    const audio = Buffer.from(input.audioBase64, "base64");
    const language = input.language ?? "fr";

    // 1. Ears — transcribe what the resident said.
    const { text: transcript } = await this.speech.transcribe({
      audio,
      mimeType: input.mimeType,
      language,
    });

    // 2. Brain — generate a short, safe, spoken-friendly reply.
    const messages: ChatMessage[] = [
      ...(input.history ?? []),
      { role: "user", content: transcript },
    ];
    const { text: reply } = await this.chat.reply(
      { residentId: input.residentId, messages },
      { language },
    );

    // 3. Voice — synthesize the reply to audio.
    const speechOut = await this.speech.synthesize({ text: reply, language });

    // 4. Audit — record that a conversation happened. Metadata only; we do
    //    NOT store raw audio or full transcripts by default.
    await this.audit.log({
      actorType: "system",
      action: "voice.conversation",
      entityType: "Resident",
      entityId: input.residentId,
      metadata: {
        transcriptLength: transcript.length,
        replyLength: reply.length,
        language,
      },
    });

    return {
      transcript,
      reply,
      audioBase64: speechOut.audio.toString("base64"),
      audioMimeType: speechOut.mimeType,
    };
  }
}

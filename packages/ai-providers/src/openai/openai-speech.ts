import OpenAI, { toFile } from "openai";
import type {
  SpeechProvider,
  TranscribeInput,
  TranscribeResult,
  SynthesizeInput,
  SynthesizeResult,
} from "../index";

export interface OpenAiSpeechOptions {
  apiKey: string;
  /** Transcription model. Defaults to "whisper-1". */
  transcribeModel?: string;
  /** Text-to-speech model. Defaults to "tts-1". */
  ttsModel?: string;
  /** TTS voice. Defaults to "alloy". */
  voice?: string;
}

/** OpenAI implementation of the companion's ears (Whisper) and voice (TTS). */
export class OpenAiSpeechProvider implements SpeechProvider {
  private readonly client: OpenAI;
  private readonly transcribeModel: string;
  private readonly ttsModel: string;
  private readonly voice: string;

  constructor(options: OpenAiSpeechOptions) {
    this.client = new OpenAI({ apiKey: options.apiKey });
    this.transcribeModel = options.transcribeModel ?? "whisper-1";
    this.ttsModel = options.ttsModel ?? "tts-1";
    this.voice = options.voice ?? "alloy";
  }

  async transcribe(input: TranscribeInput): Promise<TranscribeResult> {
    const extension = mimeToExtension(input.mimeType);
    const file = await toFile(input.audio, `audio.${extension}`, {
      type: input.mimeType,
    });

    const result = await this.client.audio.transcriptions.create({
      file,
      model: this.transcribeModel,
      language: input.language,
    });

    return { text: result.text.trim() };
  }

  async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    const response = await this.client.audio.speech.create({
      model: this.ttsModel,
      voice: this.voice as never,
      input: input.text,
      response_format: "mp3",
    });

    const audio = Buffer.from(await response.arrayBuffer());
    return { audio, mimeType: "audio/mpeg" };
  }
}

function mimeToExtension(mimeType: string): string {
  const map: Record<string, string> = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "mp4",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
  };
  return map[mimeType.split(";")[0].trim()] ?? "webm";
}

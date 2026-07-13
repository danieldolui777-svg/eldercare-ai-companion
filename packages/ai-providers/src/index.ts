// Provider interfaces — no implementation in Milestone 1.
// Concrete providers (OpenAI Realtime, Claude) go in Phase 3.

export interface StartVoiceSessionInput {
  residentId: string;
  systemPrompt: string;
}

export interface VoiceSession {
  sessionId: string;
  startedAt: Date;
}

export interface VoiceProvider {
  startSession(input: StartVoiceSessionInput): Promise<VoiceSession>;
  endSession(sessionId: string): Promise<void>;
}

export interface DailySummaryInput {
  residentId: string;
  date: Date;
  reminderEvents: unknown[];
  alerts: unknown[];
}

export interface DailySummary {
  text: string;
  generatedAt: Date;
}

export interface RiskClassificationInput {
  transcript: string;
  residentId: string;
}

export interface RiskClassification {
  risk: "low" | "medium" | "high" | "emergency";
  reason: string;
}

export interface TextLLMProvider {
  generateDailySummary(input: DailySummaryInput): Promise<DailySummary>;
  classifyConversationRisk(input: RiskClassificationInput): Promise<RiskClassification>;
}

// ---------------------------------------------------------------------------
// Phase 3 — "simple prototype" voice pipeline (STT -> chat -> TTS).
// Kept vendor-agnostic: an OpenAI implementation lives behind these.
// The realtime VoiceProvider above stays for a future low-latency upgrade.
// ---------------------------------------------------------------------------

/** Speech-to-text — the companion's "ears". */
export interface TranscribeInput {
  /** Raw audio bytes captured from the device microphone. */
  audio: Buffer;
  /** MIME type of the audio, e.g. "audio/webm" or "audio/wav". */
  mimeType: string;
  /** Optional BCP-47 language hint, e.g. "fr" or "en". */
  language?: string;
}

export interface TranscribeResult {
  text: string;
}

/** Text-to-speech — the companion's "voice". */
export interface SynthesizeInput {
  text: string;
  /** Optional BCP-47 language hint, e.g. "fr" or "en". */
  language?: string;
}

export interface SynthesizeResult {
  audio: Buffer;
  mimeType: string;
}

export interface SpeechProvider {
  transcribe(input: TranscribeInput): Promise<TranscribeResult>;
  synthesize(input: SynthesizeInput): Promise<SynthesizeResult>;
}

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** A single conversational turn for the companion's "brain". */
export interface CompanionReplyInput {
  residentId: string;
  /** Prior conversation turns (excluding the system prompt). */
  messages: ChatMessage[];
}

export interface CompanionReply {
  text: string;
}

export interface CompanionChatProvider {
  reply(input: CompanionReplyInput): Promise<CompanionReply>;
}

// Note: extractMemoryFacts lives on the concrete provider; see OpenAiCompanionChatProvider.

/** A due reminder reference passed to the classifier (curated, not the full record). */
export interface MedicationReminderRef {
  id: string;
  medicationName: string;
}

export type MedicationConfirmStatus =
  | "confirmed_taken"
  | "confirmed_not_taken"
  | "unknown";

export interface ClassifyMedicationInput {
  transcript: string;
  reminders: MedicationReminderRef[];
  language?: "fr" | "en";
}

export interface MedicationClassification {
  reminderId: string;
  status: MedicationConfirmStatus;
}

// --- Curated companion memory ------------------------------------------------
// Distilled, NON-MEDICAL facts extracted from conversation so the companion can
// remember the person across sessions. Medical/diagnostic content is excluded by
// design (data boundary).

export type MemoryCategory =
  | "family"
  | "preference"
  | "life_history"
  | "routine"
  | "other";

export interface MemoryFact {
  category: MemoryCategory;
  content: string;
}

export interface ConversationExchange {
  role: "user" | "assistant";
  content: string;
}

export interface ExtractMemoryInput {
  /** Conversation turns to distil lasting facts from. */
  exchanges: ConversationExchange[];
  /** Facts already stored, so the extractor does not repeat them. */
  existingFacts?: string[];
  language?: "fr" | "en";
}

// ---------------------------------------------------------------------------
// Concrete OpenAI implementations (the first provider — swappable later).
// ---------------------------------------------------------------------------

export {
  OpenAiSpeechProvider,
  type OpenAiSpeechOptions,
} from "./openai/openai-speech";
export {
  OpenAiCompanionChatProvider,
  type OpenAiChatOptions,
} from "./openai/openai-chat";
export {
  buildCompanionSystemPrompt,
  formatToday,
  type CompanionPromptOptions,
  type DueReminder,
} from "./openai/companion-prompt";
export {
  TavilyWebSearch,
  OpenAiWebSearch,
  createWebSearchProvider,
  type WebSearchProvider,
  type WebSearchResult,
  type WebSearchSource,
} from "./openai/web-search";

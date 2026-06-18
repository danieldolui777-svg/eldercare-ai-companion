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

import OpenAI from "openai";
import type {
  CompanionChatProvider,
  CompanionReplyInput,
  CompanionReply,
  ClassifyMedicationInput,
  MedicationClassification,
} from "../index";
import {
  buildCompanionSystemPrompt,
  type CompanionPromptOptions,
} from "./companion-prompt";

const VALID_STATUSES = new Set([
  "confirmed_taken",
  "confirmed_not_taken",
  "unknown",
]);

export interface OpenAiChatOptions {
  apiKey: string;
  /** Chat model. Defaults to "gpt-4o-mini" for cost control. */
  model?: string;
}

/** OpenAI implementation of the companion's conversational "brain". */
export class OpenAiCompanionChatProvider implements CompanionChatProvider {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: OpenAiChatOptions) {
    this.client = new OpenAI({ apiKey: options.apiKey });
    this.model = options.model ?? "gpt-4o-mini";
  }

  async reply(
    input: CompanionReplyInput,
    promptOptions: CompanionPromptOptions = {},
  ): Promise<CompanionReply> {
    const systemPrompt = buildCompanionSystemPrompt(promptOptions);

    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.7,
      max_tokens: 200,
      messages: [
        { role: "system", content: systemPrompt },
        ...input.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    });

    const text =
      completion.choices[0]?.message?.content?.trim() ??
      "Pardon, je n'ai pas bien compris. Pouvez-vous répéter ?";

    return { text };
  }

  /**
   * Decide whether the resident's utterance indicates they took, did not take,
   * or are unsure about one of the due medications. Returns null when the
   * utterance is not about medication (e.g. ordinary chit-chat).
   *
   * This is ONLY a natural-language classifier. It does not record anything —
   * the deterministic backend owns that decision and the audit trail.
   */
  async classifyMedicationResponse(
    input: ClassifyMedicationInput,
  ): Promise<MedicationClassification | null> {
    if (input.reminders.length === 0) return null;

    const list = input.reminders
      .map((r) => `id=${r.id} name="${r.medicationName}"`)
      .join("\n");

    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0,
      max_tokens: 100,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You classify whether an elderly person's message says they have",
            "taken, have NOT taken, or are UNSURE about one of their due",
            "medications. Only consider these due medications:",
            list,
            "",
            'Respond ONLY with JSON: {"reminderId": <id or null>, "status":',
            '"confirmed_taken" | "confirmed_not_taken" | "unknown" | "none"}.',
            'Use "none" (and reminderId null) when the message is not about',
            "taking a medication. Use the exact id from the list.",
          ].join("\n"),
        },
        { role: "user", content: input.transcript },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;

    let parsed: { reminderId?: unknown; status?: unknown };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }

    const status = parsed.status;
    const reminderId = parsed.reminderId;
    if (typeof status !== "string" || !VALID_STATUSES.has(status)) return null;
    if (typeof reminderId !== "string") return null;
    // Guard against hallucinated ids — must match a real due reminder.
    if (!input.reminders.some((r) => r.id === reminderId)) return null;

    return {
      reminderId,
      status: status as MedicationClassification["status"],
    };
  }
}

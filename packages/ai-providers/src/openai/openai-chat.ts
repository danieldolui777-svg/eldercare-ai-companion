import OpenAI from "openai";
import type {
  CompanionChatProvider,
  CompanionReplyInput,
  CompanionReply,
  ClassifyMedicationInput,
  MedicationClassification,
  ExtractMemoryInput,
  MemoryFact,
  MemoryCategory,
} from "../index";
import {
  buildCompanionSystemPrompt,
  type CompanionPromptOptions,
} from "./companion-prompt";
import type { WebSearchProvider } from "./web-search";

const VALID_STATUSES = new Set([
  "confirmed_taken",
  "confirmed_not_taken",
  "unknown",
]);

const VALID_MEMORY_CATEGORIES = new Set<MemoryCategory>([
  "family",
  "preference",
  "life_history",
  "routine",
  "other",
]);

export interface OpenAiChatOptions {
  apiKey: string;
  /** Chat model. Defaults to "gpt-4o-mini" for cost control. */
  model?: string;
  /** Optional web-search backend. When set, the companion can look things up. */
  webSearch?: WebSearchProvider;
}

const SEARCH_TOOL = {
  type: "function" as const,
  function: {
    name: "search_web",
    description:
      "Search the web for CURRENT, up-to-date information: news, weather, " +
      "recent events, sports results, prices, today's facts. Use ONLY when the " +
      "person asks about something recent or that you cannot know from memory. " +
      "Do NOT use it for medical, legal, or financial advice.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to search for" },
      },
      required: ["query"],
    },
  },
};

/** OpenAI implementation of the companion's conversational "brain". */
export class OpenAiCompanionChatProvider implements CompanionChatProvider {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly webSearch?: WebSearchProvider;

  constructor(options: OpenAiChatOptions) {
    this.client = new OpenAI({ apiKey: options.apiKey });
    this.model = options.model ?? "gpt-4o-mini";
    this.webSearch = options.webSearch;
  }

  async reply(
    input: CompanionReplyInput,
    promptOptions: CompanionPromptOptions = {},
  ): Promise<CompanionReply> {
    const systemPrompt = buildCompanionSystemPrompt(promptOptions);
    const baseMessages: any[] = [
      { role: "system", content: systemPrompt },
      ...input.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const first = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.7,
      max_tokens: 300,
      messages: baseMessages,
      ...(this.webSearch ? { tools: [SEARCH_TOOL] } : {}),
    });

    const msg = first.choices[0]?.message;

    // If the companion asked to search the web, run it and let it answer again.
    if (this.webSearch && msg?.tool_calls?.length) {
      const toolMessages: any[] = [];
      for (const tc of msg.tool_calls) {
        if (tc.function?.name !== "search_web") continue;
        let result = "";
        try {
          const args = JSON.parse(tc.function.arguments || "{}");
          const r = await this.webSearch.search(String(args.query ?? ""));
          const sources = r.sources.length
            ? `\nSources: ${r.sources.map((s) => s.url).join(", ")}`
            : "";
          result = `${r.text}${sources}`;
        } catch (err) {
          result = "La recherche web a échoué; réponds sans info récente.";
        }
        toolMessages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: result,
        });
      }

      const second = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0.7,
        max_tokens: 300,
        messages: [...baseMessages, msg as any, ...toolMessages],
      });
      const text =
        second.choices[0]?.message?.content?.trim() ??
        "Pardon, je n'ai pas bien compris. Pouvez-vous répéter ?";
      return { text };
    }

    const text =
      msg?.content?.trim() ??
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

  /**
   * Distil lasting, NON-MEDICAL facts about the person from a conversation, so
   * the companion can remember them next time (names of relatives, hobbies, past
   * job, routines, preferences). Returns only NEW facts not already known.
   *
   * Safety: the prompt forbids storing medical, diagnostic, medication, or
   * sensitive health information — that lives behind the deterministic backend,
   * never in free-form companion memory.
   */
  async extractMemoryFacts(input: ExtractMemoryInput): Promise<MemoryFact[]> {
    if (input.exchanges.length === 0) return [];

    const convo = input.exchanges
      .map((e) => `${e.role === "user" ? "Person" : "Companion"}: ${e.content}`)
      .join("\n");
    const known =
      (input.existingFacts ?? []).length > 0
        ? `Already known (do NOT repeat these):\n${(input.existingFacts ?? [])
            .map((f) => `- ${f}`)
            .join("\n")}`
        : "Nothing is known yet.";

    let completion;
    try {
      completion = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0,
        max_tokens: 300,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "You maintain a warm companion's long-term memory of an elderly",
              "person. From the conversation, extract only NEW, lasting, useful",
              "facts about the person that would help a companion remember them.",
              "",
              "Categories: family, preference, life_history, routine, other.",
              "",
              "STRICT RULES:",
              "- NEVER store medical, diagnostic, medication, dosage, symptom, or",
              "  sensitive health information. Skip anything health-related.",
              "- Only durable facts (a relative's name, a hobby, a former job, a",
              "  daily habit). Ignore small talk, weather, one-off moods.",
              "- Do not repeat facts already known.",
              "- Keep each fact short, third-person, factual.",
              "",
              known,
              "",
              'Respond ONLY with JSON: {"facts": [{"category": <category>,',
              '"content": <short fact>}]}. Empty list if nothing new/durable.',
            ].join("\n"),
          },
          { role: "user", content: convo },
        ],
      });
    } catch {
      return [];
    }

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return [];

    let parsed: { facts?: unknown };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
    if (!Array.isArray(parsed.facts)) return [];

    const out: MemoryFact[] = [];
    for (const f of parsed.facts) {
      const category = (f as any)?.category;
      const content = (f as any)?.content;
      if (typeof content !== "string" || content.trim().length === 0) continue;
      const cat: MemoryCategory = VALID_MEMORY_CATEGORIES.has(category)
        ? category
        : "other";
      out.push({ category: cat, content: content.trim().slice(0, 300) });
    }
    return out.slice(0, 10);
  }
}

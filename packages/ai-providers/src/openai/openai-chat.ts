import OpenAI from "openai";
import type {
  CompanionChatProvider,
  CompanionReplyInput,
  CompanionReply,
} from "../index";
import {
  buildCompanionSystemPrompt,
  type CompanionPromptOptions,
} from "./companion-prompt";

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
}

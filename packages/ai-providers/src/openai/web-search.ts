import OpenAI from "openai";

export interface WebSearchSource {
  title: string;
  url: string;
}

export interface WebSearchResult {
  /** Concise, synthesised facts the companion can read out. */
  text: string;
  sources: WebSearchSource[];
}

/** A pluggable web-search backend. Swap the implementation without touching the
 *  companion — keeps the search capability provider-agnostic. */
export interface WebSearchProvider {
  readonly name: string;
  search(query: string): Promise<WebSearchResult>;
}

/**
 * Tavily — a search API built for LLMs. Simple REST, returns a synthesised
 * answer + sources. Provider-agnostic (works with any chat model). Needs a key.
 */
export class TavilyWebSearch implements WebSearchProvider {
  readonly name = "tavily";
  constructor(private readonly apiKey: string) {}

  async search(query: string): Promise<WebSearchResult> {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: this.apiKey,
        query,
        max_results: 5,
        include_answer: true,
        search_depth: "basic",
      }),
    });
    if (!res.ok) throw new Error(`Tavily ${res.status}`);
    const data: any = await res.json();
    const results: any[] = Array.isArray(data.results) ? data.results : [];
    const text =
      data.answer ||
      results.map((r) => `- ${r.title}: ${r.content}`).join("\n") ||
      "Aucun résultat trouvé.";
    return {
      text,
      sources: results
        .slice(0, 5)
        .map((r) => ({ title: r.title ?? r.url, url: r.url })),
    };
  }
}

/**
 * OpenAI's built-in web search (Responses API) — the same capability ChatGPT
 * uses. No extra vendor, uses the existing OpenAI key. The model does the search
 * and returns a grounded summary.
 */
export class OpenAiWebSearch implements WebSearchProvider {
  readonly name = "openai";
  constructor(
    private readonly client: OpenAI,
    private readonly model: string = "gpt-4o-mini",
    private readonly toolType: string = "web_search_preview",
  ) {}

  async search(query: string): Promise<WebSearchResult> {
    const resp: any = await (this.client as any).responses.create({
      model: this.model,
      tools: [{ type: this.toolType }],
      input:
        `Recherche sur le web les informations les plus récentes et fiables sur : ` +
        `${query}. Donne les faits clés de façon concise (2-4 phrases).`,
    });
    const text: string =
      resp.output_text ?? extractOutputText(resp) ?? "Aucun résultat trouvé.";
    return { text, sources: extractSources(resp) };
  }
}

/**
 * Build the configured web-search provider (or none). Defaults to OpenAI's
 * built-in search when a key is present, so search works with no extra vendor.
 */
export function createWebSearchProvider(config: {
  provider?: string; // "openai" | "tavily" | "none"
  openaiApiKey?: string;
  openaiModel?: string;
  openaiToolType?: string;
  tavilyApiKey?: string;
}): WebSearchProvider | undefined {
  const p = (config.provider ?? "openai").toLowerCase();
  if (p === "none") return undefined;
  if (p === "tavily") {
    return config.tavilyApiKey
      ? new TavilyWebSearch(config.tavilyApiKey)
      : undefined;
  }
  // default: openai
  return config.openaiApiKey
    ? new OpenAiWebSearch(
        new OpenAI({ apiKey: config.openaiApiKey }),
        config.openaiModel,
        config.openaiToolType,
      )
    : undefined;
}

function extractOutputText(resp: any): string {
  try {
    const parts: string[] = [];
    for (const item of resp.output ?? []) {
      for (const c of item.content ?? []) {
        if (typeof c.text === "string") parts.push(c.text);
      }
    }
    return parts.join("\n");
  } catch {
    return "";
  }
}

function extractSources(resp: any): WebSearchSource[] {
  const out: WebSearchSource[] = [];
  try {
    for (const item of resp.output ?? []) {
      for (const c of item.content ?? []) {
        for (const a of c.annotations ?? []) {
          if (a.url) out.push({ title: a.title ?? a.url, url: a.url });
        }
      }
    }
  } catch {
    /* best effort */
  }
  return out.slice(0, 5);
}

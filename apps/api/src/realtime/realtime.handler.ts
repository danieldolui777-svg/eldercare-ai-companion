import { Injectable, Logger } from "@nestjs/common";
import { IncomingMessage } from "http";
import WebSocket from "ws";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { MemoryService } from "../memory/memory.service";
import {
  buildCompanionSystemPrompt,
  formatToday,
  createWebSearchProvider,
  type WebSearchProvider,
} from "@eldercare/ai-providers";

const OPENAI_REALTIME_URL =
  "wss://api.openai.com/v1/realtime?model=gpt-realtime-mini";

/**
 * Proxies a browser WebSocket connection to the OpenAI Realtime API.
 *
 * - Loads the resident + due reminders when the connection opens and injects
 *   them into the session instructions.
 * - Forwards PCM16 audio chunks browser → OpenAI.
 * - Forwards streaming audio chunks OpenAI → browser.
 * - OpenAI's server-side VAD handles speech/silence detection; no VAD code needed
 *   on the browser side during an active session.
 */
@Injectable()
export class RealtimeHandler {
  private readonly logger = new Logger(RealtimeHandler.name);
  private readonly apiKey = process.env.OPENAI_API_KEY ?? "";
  private readonly webSearch?: WebSearchProvider;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly memory: MemoryService,
  ) {
    this.webSearch = createWebSearchProvider({
      provider: process.env.WEB_SEARCH_PROVIDER,
      openaiApiKey: this.apiKey,
      openaiModel: process.env.WEB_SEARCH_MODEL,
      openaiToolType: process.env.OPENAI_WEB_SEARCH_TOOL,
      tavilyApiKey: process.env.TAVILY_API_KEY,
    });
  }

  async handle(
    client: WebSocket,
    req: IncomingMessage,
    authResidentId?: string,
  ): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");
    // Resident id is trusted from the authenticated device token, not the query.
    const residentId =
      authResidentId ?? url.searchParams.get("residentId") ?? "demo";
    const language = (url.searchParams.get("language") ?? "fr") as "fr" | "en";

    // Tunable from the device settings panel (query params), with safe defaults.
    const ALLOWED_VOICES = [
      "alloy", "ash", "ballad", "coral", "echo",
      "sage", "shimmer", "verse", "marin", "cedar",
    ];
    const voiceParam = url.searchParams.get("voice") ?? "shimmer";
    const voice = ALLOWED_VOICES.includes(voiceParam) ? voiceParam : "shimmer";

    // Input audio noise reduction — filters ambient noise BEFORE turn detection,
    // so background chatter is far less likely to interrupt. "far_field" suits a
    // tablet/phone sitting on a table in a room; "near_field" a close-held phone.
    const NR_TYPES = ["near_field", "far_field"];
    const nrParam = url.searchParams.get("nr") ?? "far_field";
    const noiseReduction = NR_TYPES.includes(nrParam) ? nrParam : null; // null = off

    // Semantic turn detection: decides the resident has finished by the MEANING of
    // what they said, not just silence — much less likely to be cut off by a pause
    // or someone talking nearby. "low" eagerness waits longest (best for elderly).
    const EAGERNESS = ["low", "medium", "high", "auto"];
    let eagerness = url.searchParams.get("eagerness") ?? "";
    if (!EAGERNESS.includes(eagerness)) {
      // Back-compat: map the old "vad" ms value onto an eagerness level.
      const vadRaw = parseInt(url.searchParams.get("vad") ?? "1100", 10);
      eagerness = vadRaw <= 500 ? "high" : vadRaw <= 900 ? "medium" : "low";
    }

    // ── Resident context ───────────────────────────────────────────────────────
    let residentFirstName: string | undefined;
    let residentGender:
      | "female" | "male" | "other" | "unspecified" | undefined;
    let familyContact: { name?: string; relation?: string } | undefined;
    let dueReminders: Array<{ medicationName: string; timeOfDay?: string }> = [];

    if (residentId && residentId !== "demo") {
      const resident = await this.prisma.resident
        .findUnique({ where: { id: residentId } })
        .catch(() => null);

      if (resident) {
        const consented =
          resident.consentStatus === "granted" ||
          resident.consentStatus === "guardian_granted";
        const privacy = (resident.privacySettings ?? {}) as {
          allowAiConversation?: boolean;
        };
        if (consented && privacy.allowAiConversation !== false) {
          residentFirstName =
            resident.preferredName ?? resident.firstName ?? undefined;
          residentGender = (resident.gender as any) ?? undefined;
          if (resident.familyContactName || resident.familyContactRelation) {
            familyContact = {
              name: resident.familyContactName ?? undefined,
              relation: resident.familyContactRelation ?? undefined,
            };
          }
          const pending = await this.prisma.reminderEvent.findMany({
            where: {
              residentId,
              status: { in: ["scheduled", "delivered"] },
              scheduledAt: { lte: new Date() },
            },
            include: { medicationSchedule: { include: { medication: true } } },
            take: 5,
          });
          dueReminders = pending.map((p) => ({
            medicationName: p.medicationSchedule.medication.name,
            timeOfDay: p.medicationSchedule.timeOfDay ?? undefined,
          }));
        }
      }
    }

    // Curated, non-medical facts the companion remembers about this person.
    const memoryFacts =
      residentId && residentId !== "demo"
        ? await this.memory.loadFacts(residentId).catch(() => [])
        : [];

    const instructions = buildCompanionSystemPrompt({
      language,
      residentFirstName,
      dueReminders,
      memoryFacts,
      currentDate: formatToday(language),
      gender: residentGender,
      familyContact,
    });

    // Accumulate the session's turns so we can distil memory when it ends.
    const sessionTurns: Array<{ role: "user" | "assistant"; content: string }> = [];
    let memoryPersisted = false;
    const persistMemory = () => {
      if (memoryPersisted) return;
      memoryPersisted = true;
      if (sessionTurns.length > 0) {
        void this.memory.recordConversation(residentId, sessionTurns.slice());
      }
    };

    // ── Connect to OpenAI Realtime ─────────────────────────────────────────────
    const openai = new WebSocket(OPENAI_REALTIME_URL, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    let ready = false;
    const queue: string[] = [];

    const sendToOpenAI = (msg: string) => {
      if (ready) {
        openai.send(msg);
      } else {
        queue.push(msg);
      }
    };

    openai.on("open", () => {
      ready = true;
      // Configure the session
      openai.send(
        JSON.stringify({
          type: "session.update",
          session: {
            type: "realtime",
            instructions,
            // GA schema: modalities → output_modalities; all audio config nested
            // under audio.input / audio.output (voice/format/transcription/VAD).
            output_modalities: ["audio"],
            // Let the companion look things up mid-conversation (spoken web search).
            ...(this.webSearch
              ? {
                  tools: [
                    {
                      type: "function",
                      name: "search_web",
                      description:
                        "Search the web for CURRENT information (news, weather, " +
                        "recent events, prices, today's facts). Use ONLY when the " +
                        "person asks about something recent you cannot know. Never " +
                        "for medical, legal, or financial advice.",
                      parameters: {
                        type: "object",
                        properties: {
                          query: { type: "string", description: "What to search for" },
                        },
                        required: ["query"],
                      },
                    },
                  ],
                  tool_choice: "auto",
                }
              : {}),
            audio: {
              input: {
                format: { type: "audio/pcm", rate: 24000 },
                // gpt-4o-mini-transcribe is newer and more accurate than whisper-1
                // for the on-screen subtitle (the model still understands raw audio).
                transcription: { model: "gpt-4o-mini-transcribe" },
                ...(noiseReduction
                  ? { noise_reduction: { type: noiseReduction } }
                  : {}),
                turn_detection: {
                  type: "semantic_vad",
                  eagerness,
                },
              },
              output: {
                format: { type: "audio/pcm", rate: 24000 },
                voice,
              },
            },
          },
        }),
      );
      // Flush anything queued before the connection was ready
      for (const msg of queue) openai.send(msg);
      queue.length = 0;
    });

    // ── OpenAI → browser ───────────────────────────────────────────────────────
    openai.on("message", async (raw) => {
      if (client.readyState !== WebSocket.OPEN) return;
      let event: Record<string, any>;
      try {
        event = JSON.parse(raw.toString());
      } catch {
        return;
      }

      switch (event.type as string) {
        // GA renamed audio events with an "output_" prefix; accept both.
        case "response.output_audio.delta":
        case "response.audio.delta":
          // Streaming audio chunk → send straight to browser
          client.send(
            JSON.stringify({ type: "audio", delta: event.delta as string }),
          );
          break;

        case "response.output_audio_transcript.done":
        case "response.audio_transcript.done":
          // Full text of what the AI said
          if (typeof event.transcript === "string") {
            sessionTurns.push({ role: "assistant", content: event.transcript });
          }
          client.send(
            JSON.stringify({ type: "reply", text: event.transcript as string }),
          );
          break;

        case "conversation.item.input_audio_transcription.completed":
          // What the resident said (Whisper transcript)
          if (typeof event.transcript === "string") {
            sessionTurns.push({ role: "user", content: event.transcript });
          }
          client.send(
            JSON.stringify({
              type: "transcript",
              text: event.transcript as string,
            }),
          );
          break;

        case "response.function_call_arguments.done": {
          // The companion asked to search the web. Run it, feed the result back,
          // and let the model continue speaking with the fresh information.
          if (event.name === "search_web" && this.webSearch) {
            client.send(JSON.stringify({ type: "reply", text: "…" }));
            let output = "La recherche web a échoué; réponds sans info récente.";
            try {
              const args = JSON.parse((event.arguments as string) || "{}");
              const r = await this.webSearch.search(String(args.query ?? ""));
              const src = r.sources.length
                ? `\nSources: ${r.sources.map((s) => s.url).join(", ")}`
                : "";
              output = `${r.text}${src}`;
            } catch (err) {
              this.logger.warn(`realtime web search failed: ${(err as Error).message}`);
            }
            sendToOpenAI(
              JSON.stringify({
                type: "conversation.item.create",
                item: {
                  type: "function_call_output",
                  call_id: event.call_id,
                  output,
                },
              }),
            );
            sendToOpenAI(JSON.stringify({ type: "response.create" }));
          }
          break;
        }

        case "response.done":
          client.send(JSON.stringify({ type: "response.done" }));
          break;

        case "input_audio_buffer.speech_started":
          // User started speaking — tell the browser so it can stop current playback
          client.send(JSON.stringify({ type: "speech_started" }));
          break;

        case "error":
          this.logger.error("OpenAI Realtime error", event.error);
          client.send(
            JSON.stringify({
              type: "error",
              message: (event.error as any)?.message ?? "Unknown error",
            }),
          );
          break;
      }
    });

    openai.on("error", (err) => {
      this.logger.error("OpenAI WebSocket error", err.message);
      if (client.readyState === WebSocket.OPEN)
        client.send(
          JSON.stringify({ type: "error", message: err.message }),
        );
      client.close();
    });

    openai.on("close", () => {
      persistMemory();
      if (client.readyState === WebSocket.OPEN) client.close();
    });

    // ── Browser → OpenAI ───────────────────────────────────────────────────────
    client.on("message", (raw) => {
      let event: Record<string, any>;
      try {
        event = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (event.type === "audio") {
        // Browser sends base64 PCM16 chunks
        sendToOpenAI(
          JSON.stringify({
            type: "input_audio_buffer.append",
            audio: event.data as string,
          }),
        );
      } else if (event.type === "text") {
        // First-turn text captured by Web Speech API (e.g. "daniel what time is it?")
        // Inject as a text message so the response starts without waiting for audio.
        sendToOpenAI(
          JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "message",
              role: "user",
              content: [{ type: "input_text", text: event.data as string }],
            },
          }),
        );
        sendToOpenAI(JSON.stringify({ type: "response.create" }));
      }
    });

    client.on("close", () => {
      persistMemory();
      if (
        openai.readyState !== WebSocket.CLOSED &&
        openai.readyState !== WebSocket.CLOSING
      ) {
        openai.close();
      }
    });

    // ── Audit ──────────────────────────────────────────────────────────────────
    await this.audit
      .log({
        actorType: "ai",
        action: "voice.realtime_session",
        entityType: "Resident",
        entityId: residentId,
        metadata: {
          language,
          remindersDue: dueReminders.length,
          voice,
          eagerness,
          noiseReduction: noiseReduction ?? "off",
        },
      })
      .catch(() => undefined);
  }
}

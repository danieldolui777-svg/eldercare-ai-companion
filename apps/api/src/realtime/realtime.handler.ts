import { Injectable, Logger } from "@nestjs/common";
import { IncomingMessage } from "http";
import WebSocket from "ws";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { buildCompanionSystemPrompt } from "@eldercare/ai-providers";

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async handle(client: WebSocket, req: IncomingMessage): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");
    const residentId = url.searchParams.get("residentId") ?? "demo";
    const language = (url.searchParams.get("language") ?? "fr") as "fr" | "en";

    // ── Resident context ───────────────────────────────────────────────────────
    let residentFirstName: string | undefined;
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

    const instructions = buildCompanionSystemPrompt({
      language,
      residentFirstName,
      dueReminders,
    });

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
            type: "conversation",
            modalities: ["text", "audio"],
            instructions,
            voice: "shimmer",
            input_audio_format: "pcm16",
            output_audio_format: "pcm16",
            input_audio_transcription: { model: "whisper-1" },
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 700,
            },
          },
        }),
      );
      // Flush anything queued before the connection was ready
      for (const msg of queue) openai.send(msg);
      queue.length = 0;
    });

    // ── OpenAI → browser ───────────────────────────────────────────────────────
    openai.on("message", (raw) => {
      if (client.readyState !== WebSocket.OPEN) return;
      let event: Record<string, any>;
      try {
        event = JSON.parse(raw.toString());
      } catch {
        return;
      }

      switch (event.type as string) {
        case "response.audio.delta":
          // Streaming audio chunk → send straight to browser
          client.send(
            JSON.stringify({ type: "audio", delta: event.delta as string }),
          );
          break;

        case "response.audio_transcript.done":
          // Full text of what the AI said
          client.send(
            JSON.stringify({ type: "reply", text: event.transcript as string }),
          );
          break;

        case "conversation.item.input_audio_transcription.completed":
          // What the resident said (Whisper transcript)
          client.send(
            JSON.stringify({
              type: "transcript",
              text: event.transcript as string,
            }),
          );
          break;

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
        metadata: { language, remindersDue: dueReminders.length },
      })
      .catch(() => undefined);
  }
}

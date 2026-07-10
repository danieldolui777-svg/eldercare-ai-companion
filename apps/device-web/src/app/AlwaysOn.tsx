"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  chat as apiChat,
  announce,
  createTestReminder,
  markReminderMissed,
  getDueReminders,
  type ChatTurn,
  type DueReminder,
} from "@/lib/api";

type Phase =
  | "idle"        // before first tap — AudioContext needs a user gesture
  | "passive"     // listening for wake word "daniel"
  | "activated"   // heard "daniel", waiting for the query
  | "thinking"    // fallback text-mode: query sent, waiting for reply
  | "speaking"    // fallback text-mode: playing reply
  | "session"     // OpenAI Realtime API — streaming audio in & out
  | "announcing"  // medication reminder — top priority, interrupts everything
  | "confirming"; // just announced a reminder, listening for the reply (no "daniel")

const WAKE_WORD = "daniel";
const ACTIVATED_TIMEOUT = 8_000;
const ECHO_COOLDOWN = 500;
const POLL_MS = 30_000;
const SESSION_IDLE_MS = 30_000; // close Realtime session after 30s of quiet
const CONFIRM_TIMEOUT = 12_000; // listen this long for a medication reply, then give up

export function AlwaysOn({
  residentId,
  language,
  onExit,
}: {
  residentId: string;
  language: "fr" | "en";
  onExit: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [clock, setClock] = useState("");
  const [wakeLabel, setWakeLabel] = useState("");
  const [lastUser, setLastUser] = useState("");
  const [lastReply, setLastReply] = useState("");
  const [badge, setBadge] = useState("");
  const [error, setError] = useState("");
  const [browserOk, setBrowserOk] = useState(true);

  // ── Tunable settings (testing panel) ───────────────────────────────────────────
  const [showSettings, setShowSettings] = useState(false);
  const [voice, setVoice] = useState("shimmer");
  // Semantic-VAD eagerness: how quickly the AI decides the patient finished.
  // "low" = most patient (waits longest) — best default for elderly + noisy rooms.
  const [eagerness, setEagerness] = useState<"low" | "medium" | "high">("low");
  // Input noise reduction: "far_field" (room mic), "near_field" (close), "off".
  const [noiseRed, setNoiseRed] = useState<"far_field" | "near_field" | "off">("far_field");
  const [wakeEngine, setWakeEngine] = useState<"web" | "picovoice">("web");
  // Mirrored in refs so the WebSocket-building callback reads the latest value
  const voiceRef = useRef(voice);
  const eagernessRef = useRef(eagerness);
  const noiseRedRef = useRef(noiseRed);
  const wakeEngineRef = useRef(wakeEngine);
  useEffect(() => { voiceRef.current = voice; }, [voice]);
  useEffect(() => { eagernessRef.current = eagerness; }, [eagerness]);
  useEffect(() => { noiseRedRef.current = noiseRed; }, [noiseRed]);
  useEffect(() => { wakeEngineRef.current = wakeEngine; }, [wakeEngine]);

  // Picovoice on-device wake-word handle (only when that engine is selected)
  const picoHandleRef = useRef<{ stop: () => Promise<void> } | null>(null);
  const workletLoadedRef = useRef(false);

  // ── Audio ─────────────────────────────────────────────────────────────────────
  const ctxRef = useRef<AudioContext | null>(null);
  // For the text-mode (fallback) single audio source:
  const currentSrcRef = useRef<AudioBufferSourceNode | null>(null);
  // For streaming PCM16 playback (Realtime API):
  const activeSrcsRef = useRef<AudioBufferSourceNode[]>([]);
  const nextPlayTimeRef = useRef<number>(0);
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Realtime session ──────────────────────────────────────────────────────────
  const wsRef = useRef<WebSocket | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const aiPlayingRef = useRef(false);
  const sessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Speech recognition ────────────────────────────────────────────────────────
  const recogRef = useRef<any>(null);
  const listeningRef = useRef(false);

  // ── System ────────────────────────────────────────────────────────────────────
  const wakeRef = useRef<any>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activatedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyRef = useRef<ChatTurn[]>([]);
  const announcedRef = useRef<Set<string>>(new Set());
  // Reminder awaiting its FIRST spoken answer — if none arrives, mark it missed.
  const pendingReminderRef = useRef<string | null>(null);
  // True while in a post-reminder conversation: keep listening after each reply
  // (no "daniel" needed) so the resident can answer the AI's follow-up question.
  const conversingRef = useRef(false);

  // Phase mirrored in a ref so async callbacks always see the latest value
  const phaseRef = useRef<Phase>("idle");
  const setPhaseSync = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const t = useCallback(
    (fr: string, en: string) => (language === "fr" ? fr : en),
    [language]
  );

  // ── Clock ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString(language === "fr" ? "fr-FR" : "en-US", {
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [language]);

  // ── Audio helpers ─────────────────────────────────────────────────────────────

  const stopCurrentAudio = useCallback(() => {
    // Stop text-mode single source
    if (currentSrcRef.current) {
      try { currentSrcRef.current.stop(); } catch { /* already stopped */ }
      currentSrcRef.current = null;
    }
    // Stop all streaming sources (Realtime mode)
    for (const src of activeSrcsRef.current) {
      try { src.stop(); } catch { /* already ended */ }
    }
    activeSrcsRef.current = [];
    nextPlayTimeRef.current = 0;
    aiPlayingRef.current = false;
  }, []);

  /** Play a single base64-encoded audio blob (TTS fallback path). */
  const playEncoded = useCallback(async (base64: string): Promise<void> => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    if (ctx.state !== "running") await ctx.resume();
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const buffer = await ctx.decodeAudioData(bytes.buffer);
    return new Promise<void>((resolve) => {
      stopCurrentAudio();
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      currentSrcRef.current = src;
      src.onended = () => { currentSrcRef.current = null; resolve(); };
      src.start();
    });
  }, [stopCurrentAudio]);

  /** Schedule a base64 PCM16 chunk (24 kHz mono) for gapless streaming playback. */
  const playPCM16Chunk = useCallback((base64: string) => {
    const ctx = ctxRef.current;
    if (!ctx || ctx.state !== "running") return;

    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    const audioBuf = ctx.createBuffer(1, float32.length, 24000);
    audioBuf.getChannelData(0).set(float32);

    const now = ctx.currentTime;
    // Keep a 50 ms ahead-of-current buffer to avoid glitches
    if (nextPlayTimeRef.current < now) nextPlayTimeRef.current = now + 0.05;

    const src = ctx.createBufferSource();
    src.buffer = audioBuf;
    src.connect(ctx.destination);
    src.start(nextPlayTimeRef.current);
    nextPlayTimeRef.current += audioBuf.duration;

    activeSrcsRef.current.push(src);
    src.onended = () => {
      activeSrcsRef.current = activeSrcsRef.current.filter((s) => s !== src);
    };
  }, []);

  const playJingle = useCallback(async () => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    if (ctx.state !== "running") await ctx.resume();
    const notes = [523.25, 659.25, 783.99];
    let t0 = ctx.currentTime + 0.02;
    for (const freq of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.4);
      t0 += 0.22;
    }
    await new Promise((r) => setTimeout(r, notes.length * 220 + 250));
  }, []);

  // ── Realtime session ──────────────────────────────────────────────────────────

  const closeRealtimeSessionRef = useRef<() => void>(() => {});
  // Filled in after startRecognition is defined (avoids forward-reference issue)
  const restartRecognitionRef = useRef<() => void>(() => {});

  const closeRealtimeSession = useCallback(() => {
    clearTimeout(sessionTimerRef.current!);
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;
    micStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    micStreamRef.current = null;
    const ws = wsRef.current;
    if (ws && ws.readyState <= WebSocket.OPEN) ws.close();
    wsRef.current = null;
    stopCurrentAudio();
    if (phaseRef.current === "session") {
      setPhaseSync("passive");
      // Restart Speech API — getUserMedia can kill it on mobile.
      // Give the mic time to release before trying to restart.
      setTimeout(() => restartRecognitionRef.current(), 600);
    }
  }, [setPhaseSync, stopCurrentAudio]);

  useEffect(() => {
    closeRealtimeSessionRef.current = closeRealtimeSession;
  }, [closeRealtimeSession]);

  const resetSessionTimer = useCallback(() => {
    clearTimeout(sessionTimerRef.current!);
    sessionTimerRef.current = setTimeout(() => {
      closeRealtimeSessionRef.current();
    }, SESSION_IDLE_MS);
  }, []);

  /**
   * Opens an OpenAI Realtime session via the backend proxy WebSocket.
   * @param initialText Optional text already captured by Web Speech API — sent as
   *   the first turn so the latency of that first response matches text mode.
   */
  const openRealtimeSession = useCallback(
    async (initialText?: string) => {
      if (wsRef.current) return; // already in session

      clearTimeout(activatedTimerRef.current!);
      setPhaseSync("session");
      setWakeLabel(t("Connexion…", "Connecting…"));
      setLastUser(initialText ?? "");
      setLastReply("");

      const ctx = ctxRef.current!;
      if (!ctx) return;
      if (ctx.state !== "running") await ctx.resume();

      // ── Derive WebSocket URL from HTTP API base ──────────────────────────────
      const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";
      const wsBase = base
        .replace(/\/api\/v1\/?$/, "")
        .replace(/^https/, "wss")
        .replace(/^http(?!s)/, "ws");
      const wsUrl =
        `${wsBase}/voice/realtime?residentId=${encodeURIComponent(residentId)}` +
        `&language=${language}&voice=${voiceRef.current}` +
        `&eagerness=${eagernessRef.current}&nr=${noiseRedRef.current}`;

      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        setError(t("Impossible de se connecter.", "Unable to connect."));
        setTimeout(() => setError(""), 3_000);
        setPhaseSync("passive");
        return;
      }
      wsRef.current = ws;

      // ── Microphone + AudioWorklet setup ─────────────────────────────────────
      // Stop wake-word listening before getUserMedia — on mobile they compete
      // for the microphone and getUserMedia can silently kill the listener.
      try { recogRef.current?.stop(); } catch { /* ignore */ }
      await picoHandleRef.current?.stop().catch(() => undefined);
      picoHandleRef.current = null;

      let workletReady = false;
      (async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
          micStreamRef.current = stream;
          // Worklet module is loaded once at start(); only fetch here as a fallback.
          if (!workletLoadedRef.current) {
            await ctx.audioWorklet.addModule("/worklets/pcm-processor.js");
            workletLoadedRef.current = true;
          }
          const source = ctx.createMediaStreamSource(stream);
          const node = new AudioWorkletNode(ctx, "pcm-processor");
          workletNodeRef.current = node;
          source.connect(node);
          workletReady = true;

          node.port.onmessage = (ev: MessageEvent) => {
            if (aiPlayingRef.current) return; // don't send during AI speech
            if (ws.readyState !== WebSocket.OPEN) return;
            const pcm = new Uint8Array(ev.data.pcm16 as ArrayBuffer);
            // Fast binary-to-base64 via DataURL approach
            let binary = "";
            const chunkSize = 8192;
            for (let i = 0; i < pcm.length; i += chunkSize) {
              binary += String.fromCharCode(...pcm.subarray(i, i + chunkSize));
            }
            ws.send(JSON.stringify({ type: "audio", data: btoa(binary) }));
          };
        } catch (err: any) {
          const msg = (err as Error)?.message ?? "unknown";
          setError(t(`Micro : ${msg}`, `Mic: ${msg}`));
          setTimeout(() => setError(""), 5_000);
          closeRealtimeSessionRef.current();
        }
      })();

      // ── WebSocket events ─────────────────────────────────────────────────────
      ws.onopen = () => {
        setWakeLabel(t("Je vous écoute…", "I'm listening…"));
        resetSessionTimer();

        // If we already have the user's text, send it as the first message so
        // the response starts immediately without waiting for audio buffering.
        if (initialText) {
          ws.send(
            JSON.stringify({
              type: "text",
              data: initialText,
              language,
            }),
          );
        }
      };

      ws.onmessage = (ev) => {
        let msg: Record<string, any>;
        try { msg = JSON.parse(ev.data as string); } catch { return; }

        switch (msg.type as string) {
          case "audio":
            aiPlayingRef.current = true;
            playPCM16Chunk(msg.delta as string);
            break;

          case "speech_started":
            // User started speaking — interrupt AI audio immediately
            stopCurrentAudio();
            break;

          case "transcript":
            setLastUser(msg.text as string);
            // Accumulate the conversation so it survives an interruption (e.g. a
            // medication reminder) and the follow-up chat still has the context.
            historyRef.current = [
              ...historyRef.current,
              { role: "user", content: msg.text as string } as ChatTurn,
            ].slice(-20);
            resetSessionTimer();
            break;

          case "reply":
            setLastReply(msg.text as string);
            historyRef.current = [
              ...historyRef.current,
              { role: "assistant", content: msg.text as string } as ChatTurn,
            ].slice(-20);
            break;

          case "response.done":
            aiPlayingRef.current = false;
            resetSessionTimer();
            break;

          case "error":
            setError(`Realtime: ${(msg.message as string) ?? "?"}`);
            setTimeout(() => setError(""), 8_000);
            closeRealtimeSessionRef.current();
            break;
        }
      };

      ws.onclose = () => {
        if (phaseRef.current === "session") closeRealtimeSessionRef.current();
      };

      ws.onerror = () => {
        if (phaseRef.current === "session") {
          setError(t("WS erreur — vérifiez connexion.", "WS error — check connection."));
          setTimeout(() => setError(""), 5_000);
          closeRealtimeSessionRef.current();
        }
      };
    },
    [residentId, language, t, setPhaseSync, playPCM16Chunk, stopCurrentAudio, resetSessionTimer]
  );

  // ── Post-reminder auto-listen ─────────────────────────────────────────────────

  /**
   * Enter (or re-enter) the "confirming" listening window: listen for a spoken
   * answer WITHOUT requiring "daniel". On timeout: if a medication reminder is
   * still awaiting its first answer, mark it missed (no-response → high alert);
   * otherwise just fall back to passive.
   */
  const armConfirmListen = useCallback(() => {
    clearTimeout(confirmTimerRef.current!);
    setPhaseSync("confirming");
    setWakeLabel(t("Je vous écoute — répondez", "Listening — please answer"));
    confirmTimerRef.current = setTimeout(async () => {
      if (phaseRef.current !== "confirming") return;
      const pid = pendingReminderRef.current;
      if (pid) {
        // No response to a medication reminder — escalate to the caregiver.
        pendingReminderRef.current = null;
        try {
          await markReminderMissed(pid);
          setBadge(t("Aucune réponse — soignant alerté", "No response — caregiver alerted"));
        } catch { /* cron will still catch it later */ }
      }
      conversingRef.current = false;
      setPhaseSync("passive");
      setWakeLabel("");
    }, CONFIRM_TIMEOUT);
  }, [setPhaseSync, t]);

  // ── Fallback text-mode API call (also used for the medication reply loop) ─────

  const sendQueryFallback = useCallback(
    async (query: string) => {
      clearTimeout(activatedTimerRef.current!);
      clearTimeout(confirmTimerRef.current!);
      setPhaseSync("thinking");
      setWakeLabel("");
      setLastUser(query);
      try {
        const res = await apiChat({
          residentId,
          text: query,
          language,
          history: historyRef.current,
        });
        historyRef.current = [
          ...historyRef.current,
          { role: "user", content: query },
          { role: "assistant", content: res.reply },
        ];
        setLastReply(res.reply);
        if (res.confirmation) {
          const c = res.confirmation;
          setBadge(
            c.status === "confirmed_taken"
              ? t(`✓ ${c.medicationName} : pris`, `✓ ${c.medicationName}: taken`)
              : c.status === "confirmed_not_taken"
              ? t(`${c.medicationName} : non pris`, `${c.medicationName}: not taken`)
              : t(`${c.medicationName} : à vérifier`, `${c.medicationName}: check with caregiver`)
          );
        }
        setPhaseSync("speaking");
        await playEncoded(res.audioBase64);
        await new Promise((r) => setTimeout(r, ECHO_COOLDOWN));
      } catch {
        setError(t("Erreur réseau — réessayez.", "Network error — try again."));
        setTimeout(() => setError(""), 3_500);
      } finally {
        // If we're mid-conversation (after a reminder), keep listening for the
        // resident's follow-up without "daniel"; otherwise go back to passive.
        if (conversingRef.current) {
          armConfirmListen();
        } else {
          setPhaseSync("passive");
        }
      }
    },
    [residentId, language, playEncoded, t, setPhaseSync, armConfirmListen]
  );

  const sendQueryFallbackRef = useRef(sendQueryFallback);
  useEffect(() => { sendQueryFallbackRef.current = sendQueryFallback; }, [sendQueryFallback]);

  // ── Medication reminders (highest priority) ───────────────────────────────────

  const handleReminder = useCallback(
    async (reminder: DueReminder) => {
      // Interrupt any ongoing session or audio
      closeRealtimeSessionRef.current();
      stopCurrentAudio();
      clearTimeout(activatedTimerRef.current!);
      announcedRef.current.add(reminder.id);
      setPhaseSync("announcing");
      try {
        await playJingle();
        const ann = await announce(residentId, reminder.id);
        setLastReply(ann.text);
        setLastUser("");
        // Keep the prior conversation and log the announcement as an assistant
        // turn, so after confirming the medication the AI still remembers what
        // was being discussed before the interruption.
        historyRef.current = [
          ...historyRef.current,
          { role: "assistant", content: ann.text } as ChatTurn,
        ].slice(-20);
        await playEncoded(ann.audioBase64);
        await new Promise((r) => setTimeout(r, ECHO_COOLDOWN));

        // Listen for the resident's reply WITHOUT requiring "daniel". Any speech
        // now is sent to /voice/chat, which records the confirmation (and creates
        // an alert if not taken). If NO reply arrives, armConfirmListen marks the
        // reminder missed (high alert). After a reply, the conversation continues.
        pendingReminderRef.current = reminder.id;
        conversingRef.current = true;
        armConfirmListen();
        setWakeLabel(
          t("Avez-vous bien pris votre médicament ?", "Did you take your medication?"),
        );
      } catch {
        // transient — skip, poll again next round
        pendingReminderRef.current = null;
        conversingRef.current = false;
        setPhaseSync("passive");
      }
    },
    [residentId, stopCurrentAudio, playJingle, playEncoded, setPhaseSync, t, armConfirmListen]
  );

  const handleReminderRef = useRef(handleReminder);
  useEffect(() => { handleReminderRef.current = handleReminder; }, [handleReminder]);

  const poll = useCallback(async () => {
    if (phaseRef.current === "announcing" || phaseRef.current === "confirming") return;
    try {
      const due = await getDueReminders(residentId);
      const next = due.find((r) => !announcedRef.current.has(r.id));
      if (next) await handleReminderRef.current(next);
    } catch { /* ignore */ }
  }, [residentId]);

  // ── Speech recognition (wake word "daniel") ───────────────────────────────────

  const processTranscript = useCallback(
    (text: string) => {
      const lower = text.toLowerCase().trim();
      const current = phaseRef.current;

      if (current === "announcing" || current === "thinking") return;
      // In session mode: Web Speech API output is ignored (server VAD handles turns)
      if (current === "session") return;

      // Auto-listen after a reminder — any speech is the resident's reply.
      // Send it to /voice/chat (records the confirmation on the first turn, then
      // continues the conversation). The resident spoke, so it is NOT a "no
      // response" case — clear the pending reminder so it won't be marked missed.
      if (current === "confirming") {
        clearTimeout(confirmTimerRef.current!);
        pendingReminderRef.current = null;
        if (text.trim().length > 1) {
          void sendQueryFallbackRef.current(text.trim());
        } else {
          conversingRef.current = false;
          setPhaseSync("passive");
          setWakeLabel("");
        }
        return;
      }

      if (current === "speaking") {
        if (!lower.includes(WAKE_WORD)) return;
        stopCurrentAudio();
        const afterWake = extractAfterWakeWord(lower);
        void openRealtimeSession(afterWake || undefined);
        return;
      }

      if (current === "passive") {
        if (!lower.includes(WAKE_WORD)) return;
        const afterWake = extractAfterWakeWord(lower);
        void openRealtimeSession(afterWake || undefined);
        return;
      }

      if (current === "activated") {
        if (lower.length > 2) {
          void openRealtimeSession(lower);
        }
      }
    },
    [stopCurrentAudio, openRealtimeSession] // eslint-disable-line react-hooks/exhaustive-deps
  );

  function extractAfterWakeWord(lower: string): string {
    const idx = lower.indexOf(WAKE_WORD);
    if (idx === -1) return "";
    return lower.slice(idx + WAKE_WORD.length).replace(/^[,!?\s]+/, "").trim();
  }

  function armActivated() {
    clearTimeout(activatedTimerRef.current!);
    setPhaseSync("activated");
    setWakeLabel(t("Oui ? Je vous écoute…", "Yes? I'm listening…"));
    activatedTimerRef.current = setTimeout(() => {
      if (phaseRef.current === "activated") {
        setPhaseSync("passive");
        setWakeLabel("");
      }
    }, ACTIVATED_TIMEOUT);
  }

  const processTranscriptRef = useRef(processTranscript);
  useEffect(() => { processTranscriptRef.current = processTranscript; }, [processTranscript]);

  const startRecognition = useCallback(() => {
    const API =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!API) { setBrowserOk(false); return; }

    const rec = new API();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = language === "fr" ? "fr-FR" : "en-US";

    rec.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript as string;
        const isFinal = event.results[i].isFinal as boolean;

        if (!isFinal) {
          // Interim: give immediate visual feedback on "daniel"
          const lower = transcript.toLowerCase();
          if (
            lower.includes(WAKE_WORD) &&
            (phaseRef.current === "passive" || phaseRef.current === "speaking")
          ) {
            if (phaseRef.current === "speaking") stopCurrentAudio();
            armActivated();
          }
          continue;
        }

        processTranscriptRef.current(transcript);
      }
    };

    rec.onerror = (event: any) => {
      if (event.error !== "no-speech" && event.error !== "aborted") {
        setError(`${t("Micro :", "Mic:")} ${event.error as string}`);
        setTimeout(() => setError(""), 3_000);
      }
    };

    rec.onend = () => {
      // Chrome stops continuous recognition after silence — restart it
      if (listeningRef.current) {
        setTimeout(() => {
          if (listeningRef.current && recogRef.current) {
            try { recogRef.current.start(); } catch { /* already started */ }
          }
        }, 300);
      }
    };

    recogRef.current = rec;
    try { rec.start(); } catch { /* ignore if already started */ }
  }, [language, t, stopCurrentAudio]);

  /**
   * Starts wake-word listening using the engine chosen in settings.
   * - "web": browser Web Speech API (Google) — default, captures text after "daniel".
   * - "picovoice": on-device Porcupine — instant, but only detects the keyword.
   * Falls back to Web Speech if Picovoice can't start.
   */
  const startWakeDetection = useCallback(async () => {
    if (wakeEngineRef.current === "picovoice") {
      try {
        const { startPicovoice, PICOVOICE_ACCESS_KEY } = await import("@/lib/picovoice");
        if (!PICOVOICE_ACCESS_KEY) throw new Error("clé manquante");
        picoHandleRef.current = await startPicovoice({
          accessKey: PICOVOICE_ACCESS_KEY,
          builtinKeyword: "Computer", // test keyword until a "Daniel" model is trained
          onWake: () => {
            const p = phaseRef.current;
            if (p === "passive" || p === "speaking") {
              if (p === "speaking") stopCurrentAudio();
              void openRealtimeSession();
            }
          },
        });
        return;
      } catch (e: any) {
        setError(
          t(
            `Local indispo (${(e as Error)?.message ?? "?"}) — Google utilisé`,
            `Local unavailable (${(e as Error)?.message ?? "?"}) — using Google`,
          ),
        );
        setTimeout(() => setError(""), 5_000);
        // fall through to Web Speech
      }
    }
    startRecognition();
  }, [startRecognition, openRealtimeSession, stopCurrentAudio, t]);

  // Wire restartRecognitionRef once the engine starters are available.
  // Called from closeRealtimeSession to recover after getUserMedia mic conflict.
  useEffect(() => {
    restartRecognitionRef.current = () => {
      if (!listeningRef.current) return;
      try { recogRef.current?.abort(); } catch { /* ignore */ }
      recogRef.current = null;
      void picoHandleRef.current?.stop().catch(() => undefined);
      picoHandleRef.current = null;
      setTimeout(() => { void startWakeDetection(); }, 300);
    };
  }, [startWakeDetection]);

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  const start = useCallback(async () => {
    setError("");
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctx();
      await ctx.resume();
      ctxRef.current = ctx;

      // Pre-compile the PCM worklet once, up front, so the first session after
      // "daniel" opens faster (no fetch+compile on the critical path).
      ctx.audioWorklet
        .addModule("/worklets/pcm-processor.js")
        .then(() => { workletLoadedRef.current = true; })
        .catch(() => undefined);

      keepAliveRef.current = setInterval(async () => {
        if (ctxRef.current?.state === "suspended") {
          await ctxRef.current.resume().catch(() => undefined);
        }
      }, 8_000);

      try {
        wakeRef.current = await (navigator as any).wakeLock?.request("screen");
      } catch { /* unsupported */ }

      listeningRef.current = true;
      void startWakeDetection();
      setPhaseSync("passive");

      void poll();
      pollRef.current = setInterval(poll, POLL_MS);
    } catch {
      setError(t("Erreur au démarrage. Rechargez la page.", "Startup error. Please reload."));
    }
  }, [startWakeDetection, poll, t, setPhaseSync]);

  useEffect(() => {
    const onVisible = async () => {
      if (document.visibilityState === "visible" && phaseRef.current !== "idle") {
        try {
          wakeRef.current = await (navigator as any).wakeLock?.request("screen");
        } catch { /* ignore */ }
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    return () => {
      listeningRef.current = false;
      clearInterval(pollRef.current!);
      clearInterval(keepAliveRef.current!);
      clearTimeout(activatedTimerRef.current!);
      clearTimeout(confirmTimerRef.current!);
      try { recogRef.current?.stop(); } catch { /* ignore */ }
      void picoHandleRef.current?.stop().catch(() => undefined);
      picoHandleRef.current = null;
      closeRealtimeSessionRef.current();
      stopCurrentAudio();
      wakeRef.current?.release?.().catch(() => undefined);
      ctxRef.current?.close().catch(() => undefined);
    };
  }, [stopCurrentAudio]);

  // ── Render ────────────────────────────────────────────────────────────────────

  if (!browserOk) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-6 px-8 text-center">
        <p className="text-white text-xl leading-relaxed">
          {t(
            "Ce navigateur ne supporte pas la reconnaissance vocale. Utilisez Chrome.",
            "This browser doesn't support speech recognition. Please use Chrome."
          )}
        </p>
        <button onClick={onExit} className="text-white/70 underline text-lg">
          {t("Retour", "Back")}
        </button>
      </div>
    );
  }

  if (phase === "idle") {
    return (
      <button
        onClick={start}
        className="h-full w-full flex flex-col items-center justify-center gap-6 px-8 text-center active:bg-white/10"
      >
        <div className="w-40 h-40 rounded-full bg-white/20 flex items-center justify-center text-7xl">
          🎙️
        </div>
        <p className="text-white text-3xl font-bold">
          {t("Touchez pour démarrer", "Tap to start")}
        </p>
        <p className="text-white/70 text-lg max-w-xs leading-relaxed">
          {t(
            "Dites « Daniel » à tout moment pour me parler.",
            'Say "Daniel" at any time to talk to me.'
          )}
        </p>
        {error && (
          <p className="mt-2 bg-red-500/80 text-white rounded-xl px-4 py-2 text-base">{error}</p>
        )}
      </button>
    );
  }

  const statusText =
    phase === "session"
      ? wakeLabel || t("Conversation en cours…", "Conversation in progress…")
      : phase === "activated"
      ? wakeLabel || t("Oui ? Je vous écoute…", "Yes? I'm listening…")
      : phase === "thinking"
      ? t("Un instant…", "One moment…")
      : phase === "speaking"
      ? t("Je vous réponds…", "Replying…")
      : phase === "announcing"
      ? t("Rappel médicaments 💊", "Medication reminder 💊")
      : phase === "confirming"
      ? wakeLabel || t("Je vous écoute — répondez", "Listening — please answer")
      : t("En écoute — dites « Daniel »", 'Listening — say "Daniel"');

  const ringClass =
    phase === "session"
      ? "bg-purple-400 scale-110"
      : phase === "activated" || phase === "confirming"
      ? "bg-green-400 scale-110"
      : phase === "thinking"
      ? "bg-yellow-300"
      : phase === "speaking" || phase === "announcing"
      ? "bg-blue-400"
      : "bg-white/20";

  const pingColor =
    phase === "session"
      ? "bg-purple-400"
      : phase === "activated" || phase === "confirming"
      ? "bg-green-400"
      : "bg-blue-400";

  // Switch wake-word engine live. Voice/VAD changes apply on the next session
  // (they're read when the WebSocket URL is built), so only the engine needs a
  // restart of the passive listener.
  const changeWakeEngine = (eng: "web" | "picovoice") => {
    setWakeEngine(eng);
    wakeEngineRef.current = eng;
    if (phaseRef.current === "passive") {
      try { recogRef.current?.abort(); } catch { /* ignore */ }
      recogRef.current = null;
      void picoHandleRef.current?.stop().catch(() => undefined);
      picoHandleRef.current = null;
      setTimeout(() => { void startWakeDetection(); }, 300);
    }
  };

  return (
    <div className="relative h-full flex flex-col items-center justify-center gap-5 px-6 text-center">
      {/* Settings gear (testing panel) */}
      <button
        onClick={() => setShowSettings((s) => !s)}
        className="absolute top-4 right-4 text-2xl opacity-60 active:opacity-100"
        aria-label={t("Réglages", "Settings")}
      >
        ⚙️
      </button>

      {showSettings && (
        <SettingsPanel
          t={t}
          voice={voice}
          eagerness={eagerness}
          noiseRed={noiseRed}
          wakeEngine={wakeEngine}
          onVoice={setVoice}
          onEagerness={setEagerness}
          onNoiseRed={setNoiseRed}
          onWakeEngine={changeWakeEngine}
          onClose={() => setShowSettings(false)}
        />
      )}

      <div className="text-6xl font-light tabular-nums opacity-80">{clock}</div>

      <div className="relative flex items-center justify-center h-32">
        {(phase === "session" || phase === "speaking" || phase === "announcing" || phase === "activated" || phase === "confirming") && (
          <div className={`absolute w-36 h-36 rounded-full animate-ping opacity-30 ${pingColor}`} />
        )}
        <div className={`w-28 h-28 rounded-full transition-all duration-200 ${ringClass}`} />
      </div>

      <p className="text-white text-lg font-medium min-h-[2.5rem] max-w-xs">{statusText}</p>

      <div className="w-full max-w-md flex flex-col gap-3 min-h-[7rem]">
        {lastUser && (
          <p className="text-white/55 text-right text-sm italic">« {lastUser} »</p>
        )}
        {lastReply && (
          <div className="bg-white text-gray-900 rounded-2xl px-5 py-4 text-xl leading-relaxed">
            {lastReply}
          </div>
        )}
        {badge && (
          <div className="bg-green-600/90 text-white rounded-xl px-4 py-2 font-medium">{badge}</div>
        )}
        {error && (
          <p className="bg-red-500/80 text-white rounded-xl px-4 py-2 text-sm">{error}</p>
        )}
      </div>

      {/* Session: show "end conversation" button */}
      {phase === "session" && (
        <button
          onClick={() => closeRealtimeSessionRef.current()}
          className="mt-1 px-5 py-2 rounded-xl bg-purple-500/30 text-white border border-purple-400/40 text-sm"
        >
          {t("Terminer la conversation", "End conversation")}
        </button>
      )}

      {/* Passive: show test reminder button */}
      {phase === "passive" && (
        <button
          onClick={async () => {
            try {
              const { reminderId } = await createTestReminder(residentId);
              announcedRef.current.clear();
              const due: DueReminder[] = [
                { id: reminderId, medicationName: "test", scheduledAt: new Date().toISOString() },
              ];
              await handleReminderRef.current(due[0]);
            } catch (e: any) {
              setError(e?.message ?? t("Erreur test rappel", "Test reminder error"));
              setTimeout(() => setError(""), 4_000);
            }
          }}
          className="mt-1 px-4 py-2 rounded-xl bg-white/10 text-white/60 text-sm border border-white/20"
        >
          💊 {t("Tester un rappel", "Test a reminder")}
        </button>
      )}

      <button onClick={onExit} className="mt-2 text-white/55 underline text-base">
        {t("Quitter", "Exit")}
      </button>
    </div>
  );
}

// ── Settings / testing panel ──────────────────────────────────────────────────

const VOICE_OPTIONS = [
  { id: "shimmer", label: "Shimmer (douce)" },
  { id: "alloy", label: "Alloy (neutre)" },
  { id: "sage", label: "Sage (posée)" },
  { id: "coral", label: "Coral (chaleureuse)" },
  { id: "verse", label: "Verse (expressive)" },
  { id: "marin", label: "Marin (récente)" },
  { id: "cedar", label: "Cedar (récente)" },
];

const EAGERNESS_OPTIONS: { id: "high" | "medium" | "low"; label: string; hint: string }[] = [
  { id: "high", label: "Réactif", hint: "répond vite" },
  { id: "medium", label: "Normal", hint: "" },
  { id: "low", label: "Patient", hint: "laisse finir" },
];

const NOISE_OPTIONS: { id: "far_field" | "near_field" | "off"; label: string }[] = [
  { id: "far_field", label: "Pièce" },
  { id: "near_field", label: "Proche" },
  { id: "off", label: "Aucune" },
];

function SettingsPanel({
  t,
  voice,
  eagerness,
  noiseRed,
  wakeEngine,
  onVoice,
  onEagerness,
  onNoiseRed,
  onWakeEngine,
  onClose,
}: {
  t: (fr: string, en: string) => string;
  voice: string;
  eagerness: "low" | "medium" | "high";
  noiseRed: "far_field" | "near_field" | "off";
  wakeEngine: "web" | "picovoice";
  onVoice: (v: string) => void;
  onEagerness: (e: "low" | "medium" | "high") => void;
  onNoiseRed: (n: "far_field" | "near_field" | "off") => void;
  onWakeEngine: (e: "web" | "picovoice") => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-20 bg-black/80 backdrop-blur-sm flex flex-col p-6 overflow-y-auto text-left">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white text-xl font-bold">{t("Réglages (test)", "Settings (test)")}</h2>
        <button onClick={onClose} className="text-white/70 text-2xl">✕</button>
      </div>

      {/* Wake-word engine */}
      <label className="text-white/80 text-sm font-medium mt-2">
        {t("Détection du mot-réveil", "Wake-word detection")}
      </label>
      <div className="flex gap-2 mt-2">
        <button
          onClick={() => onWakeEngine("web")}
          className={`flex-1 px-3 py-3 rounded-xl text-sm border ${
            wakeEngine === "web"
              ? "bg-blue-500 text-white border-blue-400"
              : "bg-white/10 text-white/70 border-white/20"
          }`}
        >
          {t("Google (« Daniel »)", 'Google ("Daniel")')}
        </button>
        <button
          onClick={() => onWakeEngine("picovoice")}
          className={`flex-1 px-3 py-3 rounded-xl text-sm border ${
            wakeEngine === "picovoice"
              ? "bg-blue-500 text-white border-blue-400"
              : "bg-white/10 text-white/70 border-white/20"
          }`}
        >
          {t("Local (« Computer »)", 'Local ("Computer")')}
        </button>
      </div>
      {wakeEngine === "picovoice" && (
        <p className="text-amber-300/90 text-xs mt-2 leading-relaxed">
          {t(
            "Mode local : nécessite une clé Picovoice + le fichier modèle. Mot de test « Computer » en attendant un modèle « Daniel ».",
            'Local mode: needs a Picovoice key + model file. Test word "Computer" until a "Daniel" model is trained.',
          )}
        </p>
      )}

      {/* Voice */}
      <label className="text-white/80 text-sm font-medium mt-5">
        {t("Voix de l'IA", "AI voice")}
      </label>
      <div className="grid grid-cols-2 gap-2 mt-2">
        {VOICE_OPTIONS.map((v) => (
          <button
            key={v.id}
            onClick={() => onVoice(v.id)}
            className={`px-3 py-2 rounded-xl text-sm border ${
              voice === v.id
                ? "bg-purple-500 text-white border-purple-400"
                : "bg-white/10 text-white/70 border-white/20"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Patience (semantic-VAD eagerness) */}
      <label className="text-white/80 text-sm font-medium mt-5">
        {t("Patience avant de répondre", "Patience before replying")}
      </label>
      <div className="flex gap-2 mt-2">
        {EAGERNESS_OPTIONS.map((o) => (
          <button
            key={o.id}
            onClick={() => onEagerness(o.id)}
            className={`flex-1 px-3 py-3 rounded-xl text-sm border ${
              eagerness === o.id
                ? "bg-green-500 text-white border-green-400"
                : "bg-white/10 text-white/70 border-white/20"
            }`}
          >
            {t(o.label, o.label)}
            {o.hint && <span className="block text-xs opacity-70">{t(o.hint, o.hint)}</span>}
          </button>
        ))}
      </div>

      {/* Noise reduction */}
      <label className="text-white/80 text-sm font-medium mt-5">
        {t("Réduction du bruit ambiant", "Ambient noise reduction")}
      </label>
      <div className="flex gap-2 mt-2">
        {NOISE_OPTIONS.map((o) => (
          <button
            key={o.id}
            onClick={() => onNoiseRed(o.id)}
            className={`flex-1 px-3 py-3 rounded-xl text-sm border ${
              noiseRed === o.id
                ? "bg-blue-500 text-white border-blue-400"
                : "bg-white/10 text-white/70 border-white/20"
            }`}
          >
            {t(o.label, o.label)}
          </button>
        ))}
      </div>
      <p className="text-white/50 text-xs mt-2 leading-relaxed">
        {t(
          "« Pièce » filtre le bruit autour (tablette posée). « Proche » si le patient tient le téléphone.",
          '"Room" filters surrounding noise (tablet on a table). "Close" if the patient holds the phone.',
        )}
      </p>

      <p className="text-white/50 text-xs mt-4 leading-relaxed">
        {t(
          "Ces réglages s'appliquent à la prochaine conversation.",
          "These settings apply to the next conversation.",
        )}
      </p>

      <button
        onClick={onClose}
        className="mt-6 px-4 py-3 rounded-xl bg-white text-gray-900 font-medium"
      >
        {t("Fermer", "Close")}
      </button>
    </div>
  );
}

"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  chat as apiChat,
  announce,
  createTestReminder,
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
  | "announcing"; // medication reminder — top priority, interrupts everything

const WAKE_WORD = "daniel";
const ACTIVATED_TIMEOUT = 8_000;
const ECHO_COOLDOWN = 500;
const POLL_MS = 30_000;
const SESSION_IDLE_MS = 30_000; // close Realtime session after 30s of quiet

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
  const historyRef = useRef<ChatTurn[]>([]);
  const announcedRef = useRef<Set<string>>(new Set());

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
      const wsUrl = `${wsBase}/voice/realtime?residentId=${encodeURIComponent(residentId)}&language=${language}`;

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
      // Stop Speech Recognition before getUserMedia — on mobile they compete
      // for the microphone and getUserMedia can silently kill the Speech API.
      try { recogRef.current?.stop(); } catch { /* ignore */ }

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
          await ctx.audioWorklet.addModule("/worklets/pcm-processor.js");
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
            resetSessionTimer();
            break;

          case "reply":
            setLastReply(msg.text as string);
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

  // ── Fallback text-mode API call (used if Realtime is unavailable) ─────────────

  const sendQueryFallback = useCallback(
    async (query: string) => {
      clearTimeout(activatedTimerRef.current!);
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
        setPhaseSync("passive");
      }
    },
    [residentId, language, playEncoded, t, setPhaseSync]
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
        await playEncoded(ann.audioBase64);
        await new Promise((r) => setTimeout(r, ECHO_COOLDOWN));
      } catch { /* transient — skip, poll again next round */ }
      finally {
        setPhaseSync("passive");
      }
    },
    [residentId, stopCurrentAudio, playJingle, playEncoded, setPhaseSync]
  );

  const handleReminderRef = useRef(handleReminder);
  useEffect(() => { handleReminderRef.current = handleReminder; }, [handleReminder]);

  const poll = useCallback(async () => {
    if (phaseRef.current === "announcing") return;
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

  // Wire restartRecognitionRef once startRecognition is available.
  // Called from closeRealtimeSession to recover after getUserMedia mic conflict.
  useEffect(() => {
    restartRecognitionRef.current = () => {
      if (!listeningRef.current) return;
      try { recogRef.current?.abort(); } catch { /* ignore */ }
      recogRef.current = null;
      setTimeout(() => startRecognition(), 300);
    };
  }, [startRecognition]);

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  const start = useCallback(async () => {
    setError("");
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctx();
      await ctx.resume();
      ctxRef.current = ctx;

      keepAliveRef.current = setInterval(async () => {
        if (ctxRef.current?.state === "suspended") {
          await ctxRef.current.resume().catch(() => undefined);
        }
      }, 8_000);

      try {
        wakeRef.current = await (navigator as any).wakeLock?.request("screen");
      } catch { /* unsupported */ }

      listeningRef.current = true;
      startRecognition();
      setPhaseSync("passive");

      void poll();
      pollRef.current = setInterval(poll, POLL_MS);
    } catch {
      setError(t("Erreur au démarrage. Rechargez la page.", "Startup error. Please reload."));
    }
  }, [startRecognition, poll, t, setPhaseSync]);

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
      try { recogRef.current?.stop(); } catch { /* ignore */ }
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
      : t("En écoute — dites « Daniel »", 'Listening — say "Daniel"');

  const ringClass =
    phase === "session"
      ? "bg-purple-400 scale-110"
      : phase === "activated"
      ? "bg-green-400 scale-110"
      : phase === "thinking"
      ? "bg-yellow-300"
      : phase === "speaking" || phase === "announcing"
      ? "bg-blue-400"
      : "bg-white/20";

  const pingColor =
    phase === "session"
      ? "bg-purple-400"
      : phase === "activated"
      ? "bg-green-400"
      : "bg-blue-400";

  return (
    <div className="h-full flex flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="text-6xl font-light tabular-nums opacity-80">{clock}</div>

      <div className="relative flex items-center justify-center h-32">
        {(phase === "session" || phase === "speaking" || phase === "announcing" || phase === "activated") && (
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

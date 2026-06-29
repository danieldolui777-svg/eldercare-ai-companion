"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  chat as apiChat,
  announce,
  getDueReminders,
  type ChatTurn,
  type DueReminder,
} from "@/lib/api";

type Phase =
  | "idle"        // before first tap — AudioContext needs a user gesture
  | "passive"     // listening for wake word "daniel"
  | "activated"   // heard "daniel", waiting for the query
  | "thinking"    // query sent to API, waiting for reply
  | "speaking"    // playing AI reply (mic still open for interruption)
  | "announcing"; // medication reminder — top priority, interrupts everything

const WAKE_WORD = "daniel";
const ACTIVATED_TIMEOUT = 8_000;  // back to passive if no query arrives in 8s
const ECHO_COOLDOWN = 700;        // ms to wait after audio finishes before re-listening
const POLL_MS = 30_000;           // medication reminder check interval

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

  // Audio
  const ctxRef = useRef<AudioContext | null>(null);
  const currentSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Speech recognition
  const recogRef = useRef<any>(null); // SpeechRecognition
  const listeningRef = useRef(false);

  // System
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
    if (currentSrcRef.current) {
      try { currentSrcRef.current.stop(); } catch { /* already stopped */ }
      currentSrcRef.current = null;
    }
  }, []);

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
      src.onended = () => {
        currentSrcRef.current = null;
        resolve();
      };
      src.start();
    });
  }, [stopCurrentAudio]);

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

  // ── API call ─────────────────────────────────────────────────────────────────

  const sendQuery = useCallback(
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

  // Ref so the SpeechRecognition handler always calls the latest version
  const sendQueryRef = useRef(sendQuery);
  useEffect(() => { sendQueryRef.current = sendQuery; }, [sendQuery]);

  // ── Medication reminders (highest priority) ───────────────────────────────────

  const handleReminder = useCallback(
    async (reminder: DueReminder) => {
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

  // ── Speech recognition ────────────────────────────────────────────────────────

  const processTranscript = useCallback(
    (text: string) => {
      const lower = text.toLowerCase().trim();
      const current = phaseRef.current;

      // Reminders are never interrupted by speech
      if (current === "announcing") return;
      // During API call, nothing to do
      if (current === "thinking") return;

      if (current === "speaking") {
        // Allow interruption only if wake word is detected
        if (!lower.includes(WAKE_WORD)) return;
        stopCurrentAudio();
        const afterWake = extractAfterWakeWord(lower);
        if (afterWake) {
          void sendQueryRef.current(afterWake);
        } else {
          armActivated();
        }
        return;
      }

      if (current === "passive") {
        if (!lower.includes(WAKE_WORD)) return;
        const afterWake = extractAfterWakeWord(lower);
        if (afterWake) {
          void sendQueryRef.current(afterWake);
        } else {
          armActivated();
        }
        return;
      }

      if (current === "activated") {
        if (lower.length > 2) {
          void sendQueryRef.current(lower);
        }
      }
    },
    [stopCurrentAudio, setPhaseSync, t] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Extracted helpers (plain functions, not hooks)
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
    if (!API) {
      setBrowserOk(false);
      return;
    }
    const rec = new API();
    rec.continuous = true;
    rec.interimResults = false; // final results only — avoids partial "dan..." triggers
    rec.lang = language === "fr" ? "fr-FR" : "en-US";

    rec.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          processTranscriptRef.current(event.results[i][0].transcript as string);
        }
      }
    };

    rec.onerror = (event: any) => {
      // 'no-speech' and 'aborted' are routine — don't alarm the user
      if (event.error !== "no-speech" && event.error !== "aborted") {
        setError(`${t("Micro :", "Mic:")} ${event.error as string}`);
        setTimeout(() => setError(""), 3_000);
      }
    };

    // Chrome sometimes stops continuous recognition after silence — restart it
    rec.onend = () => {
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
  }, [language, t]);

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  const start = useCallback(async () => {
    setError("");
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctx();
      await ctx.resume();
      ctxRef.current = ctx;

      // Keep AudioContext alive — browsers suspend it after ~30s of silence
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
      setError(
        t("Erreur au démarrage. Rechargez la page.", "Startup error. Please reload.")
      );
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
            "Say \"Daniel\" at any time to talk to me."
          )}
        </p>
        {error && (
          <p className="mt-2 bg-red-500/80 text-white rounded-xl px-4 py-2 text-base">
            {error}
          </p>
        )}
      </button>
    );
  }

  const statusText =
    phase === "activated"
      ? wakeLabel || t("Oui ? Je vous écoute…", "Yes? I'm listening…")
      : phase === "thinking"
      ? t("Un instant…", "One moment…")
      : phase === "speaking"
      ? t("Je vous réponds… (dites « Daniel » pour interrompre)", 'Replying… (say "Daniel" to interrupt)')
      : phase === "announcing"
      ? t("Rappel médicaments 💊", "Medication reminder 💊")
      : t("En écoute — dites « Daniel »", 'Listening — say "Daniel"');

  const ringClass =
    phase === "activated"
      ? "bg-green-400 scale-110"
      : phase === "thinking"
      ? "bg-yellow-300"
      : phase === "speaking" || phase === "announcing"
      ? "bg-blue-400"
      : "bg-white/20"; // passive: subtle dim ring

  return (
    <div className="h-full flex flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="text-6xl font-light tabular-nums opacity-80">{clock}</div>

      <div className="relative flex items-center justify-center h-32">
        {(phase === "speaking" || phase === "announcing" || phase === "activated") && (
          <div className={`absolute w-36 h-36 rounded-full animate-ping opacity-30 ${
            phase === "activated" ? "bg-green-400" : "bg-blue-400"
          }`} />
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
          <div className="bg-green-600/90 text-white rounded-xl px-4 py-2 font-medium">
            {badge}
          </div>
        )}
        {error && (
          <p className="bg-red-500/80 text-white rounded-xl px-4 py-2 text-sm">{error}</p>
        )}
      </div>

      <button onClick={onExit} className="mt-2 text-white/55 underline text-base">
        {t("Quitter", "Exit")}
      </button>
    </div>
  );
}

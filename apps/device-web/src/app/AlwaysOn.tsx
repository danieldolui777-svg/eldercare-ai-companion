"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  announce,
  converse,
  getDueReminders,
  type ChatTurn,
  type DueReminder,
} from "@/lib/api";

type Phase =
  | "idle"        // waiting for Start tap
  | "listening"   // VAD running, no speech detected
  | "speech"      // speech detected, recording
  | "thinking"    // audio sent to API
  | "speaking"    // playing AI reply
  | "announcing"; // playing medication jingle/announcement

// VAD thresholds — tweak if too sensitive or not sensitive enough
const SPEECH_RMS = 0.022;       // RMS above this = speech
const SILENCE_RMS = 0.015;      // RMS below this = silence
const SPEECH_DEBOUNCE = 350;    // ms above threshold before recording starts
const SILENCE_DEBOUNCE = 1_500; // ms of silence before recording stops
const MIN_RECORD_MS = 700;      // recordings shorter than this are ignored (noise)
const ECHO_COOLDOWN_MS = 600;   // pause after AI speaks before listening again
const POLL_MS = 30_000;         // check for due medication reminders every 30s

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
  const [lastUser, setLastUser] = useState("");
  const [lastReply, setLastReply] = useState("");
  const [badge, setBadge] = useState("");
  const [error, setError] = useState("");
  const [rmsLevel, setRmsLevel] = useState(0); // 0–1 for the visual ring

  // Audio infrastructure
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataRef = useRef<Float32Array>(new Float32Array(512));
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // System refs
  const wakeRef = useRef<any>(null);
  const pollRef = useRef<any>(null);
  const keepAliveRef = useRef<any>(null);
  const rafRef = useRef<number>(0);
  const historyRef = useRef<ChatTurn[]>([]);
  const announcedRef = useRef<Set<string>>(new Set());

  // VAD state — all in refs so the RAF loop reads the latest without re-renders
  const busyRef = useRef(false);           // true while recording/thinking/speaking
  const phaseRef = useRef<Phase>("idle");  // mirrors `phase` for the RAF loop
  const speechSinceRef = useRef<number | null>(null);
  const silenceSinceRef = useRef<number | null>(null);
  const recordStartRef = useRef<number>(0);

  // Stable refs to latest callbacks (avoids stale closure issues in RAF loop)
  const sendAudioRef = useRef<(blob: Blob) => Promise<void>>(async () => {});
  const handleReminderRef = useRef<(r: DueReminder) => Promise<void>>(async () => {});

  const t = useCallback(
    (fr: string, en: string) => (language === "fr" ? fr : en),
    [language]
  );

  // Keep phaseRef in sync with React state
  const setPhaseSync = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

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

  // ── Audio helpers ────────────────────────────────────────────────────────────

  const playEncoded = useCallback(async (base64: string): Promise<void> => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    // Browsers suspend AudioContext after inactivity — resume before every playback
    if (ctx.state !== "running") await ctx.resume();
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const buffer = await ctx.decodeAudioData(bytes.buffer);
    return new Promise<void>((resolve) => {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      src.onended = () => resolve();
      src.start();
    });
  }, []);

  const playJingle = useCallback(async () => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const notes = [523.25, 659.25, 783.99]; // C5-E5-G5 gentle chime
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

  // ── Conversation ─────────────────────────────────────────────────────────────

  const sendAudio = useCallback(
    async (blob: Blob) => {
      busyRef.current = true;
      setPhaseSync("thinking");
      try {
        const base64 = await blobToBase64(blob);
        const res = await converse({
          residentId,
          audioBase64: base64,
          mimeType: blob.type || "audio/webm",
          language,
          history: historyRef.current,
        });
        historyRef.current = [
          ...historyRef.current,
          { role: "user", content: res.transcript },
          { role: "assistant", content: res.reply },
        ];
        setLastUser(res.transcript);
        setLastReply(res.reply);
        if (res.confirmation) {
          const c = res.confirmation;
          setBadge(
            c.status === "confirmed_taken"
              ? t(`✓ ${c.medicationName} : pris`, `✓ ${c.medicationName}: taken`)
              : c.status === "confirmed_not_taken"
              ? t(`${c.medicationName} : non pris — soignant prévenu`, `${c.medicationName}: not taken — caregiver alerted`)
              : t(`${c.medicationName} : à vérifier`, `${c.medicationName}: to verify`)
          );
        }
        setPhaseSync("speaking");
        await playEncoded(res.audioBase64);
        await new Promise((r) => setTimeout(r, ECHO_COOLDOWN_MS));
      } catch {
        setError(t("Erreur réseau — je réessaie.", "Network error — retrying."));
        setTimeout(() => setError(""), 4_000);
      } finally {
        busyRef.current = false;
        setPhaseSync("listening");
        speechSinceRef.current = null;
        silenceSinceRef.current = null;
      }
    },
    [residentId, language, playEncoded, t, setPhaseSync]
  );

  // Keep the RAF loop's ref to sendAudio always current
  useEffect(() => {
    sendAudioRef.current = sendAudio;
  }, [sendAudio]);

  // ── Medication reminders ──────────────────────────────────────────────────────

  const handleReminder = useCallback(
    async (reminder: DueReminder) => {
      busyRef.current = true;
      announcedRef.current.add(reminder.id);
      setPhaseSync("announcing");
      try {
        await playJingle();
        const ann = await announce(residentId, reminder.id);
        setLastReply(ann.text);
        await playEncoded(ann.audioBase64);
        // After the announcement the resident may answer naturally →
        // the VAD will pick that up as a normal turn.
        await new Promise((r) => setTimeout(r, ECHO_COOLDOWN_MS));
      } catch {
        /* transient — skip, will retry next poll */
      } finally {
        busyRef.current = false;
        setPhaseSync("listening");
        speechSinceRef.current = null;
        silenceSinceRef.current = null;
      }
    },
    [residentId, playJingle, playEncoded, setPhaseSync]
  );

  useEffect(() => {
    handleReminderRef.current = handleReminder;
  }, [handleReminder]);

  const poll = useCallback(async () => {
    if (busyRef.current) return;
    try {
      const due = await getDueReminders(residentId);
      const next = due.find((r) => !announcedRef.current.has(r.id));
      if (next) await handleReminderRef.current(next);
    } catch {
      /* ignore transient errors */
    }
  }, [residentId]);

  // ── VAD loop (runs every animation frame) ────────────────────────────────────

  const stopRecorder = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    recorder.onstop = () => {
      const elapsed = Date.now() - recordStartRef.current;
      if (elapsed < MIN_RECORD_MS) {
        // Too short — just noise, reset
        busyRef.current = false;
        setPhaseSync("listening");
        return;
      }
      const blob = new Blob(chunksRef.current, {
        type: chunksRef.current[0]?.type || "audio/webm",
      });
      void sendAudioRef.current(blob);
    };
    recorder.stop();
  }, [setPhaseSync]);

  const startRecorder = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorderRef.current = recorder;
    recorder.start();
    recordStartRef.current = Date.now();
    setPhaseSync("speech");
  }, [setPhaseSync]);

  // stopRecorderRef so the RAF loop can call the latest stopRecorder
  const stopRecorderRef = useRef(stopRecorder);
  const startRecorderRef = useRef(startRecorder);
  useEffect(() => { stopRecorderRef.current = stopRecorder; }, [stopRecorder]);
  useEffect(() => { startRecorderRef.current = startRecorder; }, [startRecorder]);

  const vadLoop = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    analyser.getFloatTimeDomainData(dataRef.current);
    const rms = Math.sqrt(
      dataRef.current.reduce((sum, x) => sum + x * x, 0) / dataRef.current.length
    );
    // Normalize to 0–1 range for the visual (0.1 RMS = max visual)
    setRmsLevel(Math.min(1, rms / 0.08));

    if (!busyRef.current) {
      const now = Date.now();
      const currentPhase = phaseRef.current;

      if (rms > SPEECH_RMS) {
        silenceSinceRef.current = null;
        if (currentPhase === "listening") {
          if (speechSinceRef.current === null) {
            speechSinceRef.current = now;
          } else if (now - speechSinceRef.current >= SPEECH_DEBOUNCE) {
            // Do NOT set busyRef=true here — silence detection runs inside the
            // same !busyRef block and would be permanently blocked.
            startRecorderRef.current();
          }
        }
      } else {
        speechSinceRef.current = null;
        if (currentPhase === "speech") {
          if (silenceSinceRef.current === null) {
            silenceSinceRef.current = now;
          } else if (now - silenceSinceRef.current >= SILENCE_DEBOUNCE) {
            silenceSinceRef.current = null;
            busyRef.current = true; // block VAD until API response is back
            stopRecorderRef.current();
          }
        }
      }
    }

    rafRef.current = requestAnimationFrame(vadLoop);
  }, []); // empty deps — reads everything through stable refs

  // ── Start / cleanup ──────────────────────────────────────────────────────────

  const start = useCallback(async () => {
    setError("");
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new Ctx();
      await audioCtx.resume();
      ctxRef.current = audioCtx;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      dataRef.current = new Float32Array(analyser.fftSize);
      source.connect(analyser);
      // intentionally NOT connecting analyser to destination — we don't play back mic input
      analyserRef.current = analyser;

      try {
        wakeRef.current = await (navigator as any).wakeLock?.request("screen");
      } catch { /* unsupported — fine */ }

      // Keep AudioContext alive — browsers suspend it after ~30s of silence
      keepAliveRef.current = setInterval(async () => {
        const ctx = ctxRef.current;
        if (ctx && ctx.state === "suspended") {
          await ctx.resume().catch(() => undefined);
        }
      }, 8_000);

      setPhaseSync("listening");
      rafRef.current = requestAnimationFrame(vadLoop);
      void poll();
      pollRef.current = setInterval(poll, POLL_MS);
    } catch {
      setError(
        t(
          "Autorisez le microphone pour activer l'écoute permanente.",
          "Allow the microphone to enable always-on listening."
        )
      );
    }
  }, [vadLoop, poll, t, setPhaseSync]);

  // Re-acquire wake lock when tab becomes visible again
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

  // Full cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      clearInterval(pollRef.current);
      clearInterval(keepAliveRef.current);
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      wakeRef.current?.release?.().catch(() => undefined);
      ctxRef.current?.close().catch(() => undefined);
    };
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────────

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
            "Après ça, parlez librement — plus besoin de toucher l'écran.",
            "After this, speak freely — no need to touch the screen again."
          )}
        </p>
        {error && (
          <p className="bg-red-500/80 text-white rounded-xl px-4 py-2 text-base">{error}</p>
        )}
      </button>
    );
  }

  // Visual ring: size + color reflect current phase
  const ringScale = phase === "speech" ? 1 + rmsLevel * 0.5 : 1;
  const ringClass =
    phase === "speaking" || phase === "announcing"
      ? "bg-blue-400 animate-pulse"
      : phase === "thinking"
      ? "bg-yellow-300"
      : phase === "speech"
      ? "bg-red-400"
      : `bg-white/25`; // listening: dim white ring

  const statusText =
    phase === "speech"
      ? t("Je vous écoute…", "I'm listening…")
      : phase === "thinking"
      ? t("Un instant…", "One moment…")
      : phase === "speaking"
      ? t("Je vous réponds…", "Replying…")
      : phase === "announcing"
      ? t("Rappel médicaments 💊", "Medication reminder 💊")
      : t("En écoute — parlez librement", "Listening — speak freely");

  return (
    <div className="h-full flex flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="text-6xl font-light tabular-nums opacity-80">{clock}</div>

      {/* VAD ring — pulses with voice level */}
      <div className="relative flex items-center justify-center h-36">
        {/* Outer glow for speaking/announcing */}
        {(phase === "speaking" || phase === "announcing") && (
          <div className="absolute w-36 h-36 rounded-full bg-blue-400/20 animate-ping" />
        )}
        <div
          className={`w-28 h-28 rounded-full transition-transform duration-75 ${ringClass}`}
          style={{ transform: `scale(${ringScale})` }}
        />
      </div>

      <p className="text-white text-xl font-medium">{statusText}</p>

      {/* Conversation display */}
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
          <div className="bg-green-600/90 text-white rounded-xl px-4 py-2 font-medium text-base">
            {badge}
          </div>
        )}
        {error && (
          <p className="bg-red-500/80 text-white rounded-xl px-4 py-2 text-sm">{error}</p>
        )}
      </div>

      <button onClick={onExit} className="mt-2 text-white/55 underline text-base">
        {t("Quitter l'écoute", "Exit listening")}
      </button>
    </div>
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

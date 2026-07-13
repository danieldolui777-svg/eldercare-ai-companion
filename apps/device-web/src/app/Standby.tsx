"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getDueReminders,
  announce,
  converse,
  type DueReminder,
} from "@/lib/api";

type Phase = "idle" | "watching" | "announcing" | "listening" | "thinking" | "result";

const POLL_MS = 30000; // check for due reminders every 30s
const LISTEN_MS = 7000; // record the resident's reply for ~7s

/**
 * Standby ("veille") mode for a dedicated room device: keeps the screen awake,
 * polls for due medication reminders, and when one is due it plays a jingle,
 * speaks the reminder, listens for the reply, and records the confirmation —
 * all WITHOUT the resident touching anything.
 *
 * Audio is played through the Web Audio API (the AudioContext is resumed during
 * the "Start" tap), which lets us play sound autonomously later without the
 * browser autoplay restrictions that block plain <audio> elements.
 */
export function Standby({
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
  const [message, setMessage] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wakeRef = useRef<any>(null);
  const pollRef = useRef<any>(null);
  const busyRef = useRef(false);
  const announcedRef = useRef<Set<string>>(new Set());

  const t = (fr: string, en: string) => (language === "fr" ? fr : en);

  // Live clock for the standby screen.
  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString(language === "fr" ? "fr-FR" : "en-US", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [language]);

  const playJingle = useCallback(async () => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const notes = [523.25, 659.25, 783.99]; // C5 - E5 - G5, a gentle chime
    let start = ctx.currentTime + 0.02;
    for (const freq of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
      start += 0.22;
    }
    await new Promise((r) => setTimeout(r, notes.length * 220 + 250));
  }, []);

  const playEncoded = useCallback(async (base64: string) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const buffer = await ctx.decodeAudioData(bytes.buffer);
    await new Promise<void>((resolve) => {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      src.onended = () => resolve();
      src.start();
    });
  }, []);

  const recordReply = useCallback(async () => {
    const stream = streamRef.current;
    if (!stream) return null;
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    const stopped = new Promise<void>((res) => {
      recorder.onstop = () => res();
    });
    recorder.start();
    await new Promise((r) => setTimeout(r, LISTEN_MS));
    recorder.stop();
    await stopped;
    const blob = new Blob(chunks, { type: chunks[0]?.type || "audio/webm" });
    const base64 = await blobToBase64(blob);
    return { base64, mime: blob.type || "audio/webm" };
  }, []);

  const handleReminder = useCallback(
    async (reminder: DueReminder) => {
      if (busyRef.current) return;
      busyRef.current = true;
      announcedRef.current.add(reminder.id);
      try {
        setResult("");
        setPhase("announcing");
        setMessage(t("Préparez-vous…", "Get ready…"));
        await playJingle();

        const ann = await announce(reminder.id);
        setMessage(ann.text);
        await playEncoded(ann.audioBase64);

        setPhase("listening");
        setMessage(
          t(
            "Je vous écoute — dites si vous l'avez pris.",
            "Listening — tell me if you've taken it.",
          ),
        );
        const rec = await recordReply();

        if (rec) {
          setPhase("thinking");
          setMessage(t("Un instant…", "One moment…"));
          const res = await converse({
            audioBase64: rec.base64,
            mimeType: rec.mime,
            language,
          });
          await playEncoded(res.audioBase64);
          if (res.confirmation) {
            const c = res.confirmation;
            setResult(
              c.status === "confirmed_taken"
                ? t(`✓ ${c.medicationName} : bien noté, c'est pris.`, `✓ ${c.medicationName}: noted as taken.`)
                : c.status === "confirmed_not_taken"
                ? t(`${c.medicationName} : non pris — un soignant est prévenu.`, `${c.medicationName}: not taken — a caregiver is notified.`)
                : t(`${c.medicationName} : un soignant va vérifier.`, `${c.medicationName}: a caregiver will check.`),
            );
          }
          setPhase("result");
          await new Promise((r) => setTimeout(r, 7000));
        }
      } catch {
        // Network/audio hiccup — drop back to watching and try again later.
      } finally {
        busyRef.current = false;
        setMessage("");
        setPhase("watching");
      }
    },
    [residentId, language, playJingle, playEncoded, recordReply, t],
  );

  const poll = useCallback(async () => {
    if (busyRef.current) return;
    try {
      const due = await getDueReminders();
      const next = due.find((r) => !announcedRef.current.has(r.id));
      if (next) await handleReminder(next);
    } catch {
      /* transient network error — ignore, poll again next tick */
    }
  }, [handleReminder]);

  const start = useCallback(async () => {
    setError("");
    try {
      const Ctx =
        window.AudioContext || (window as unknown as any).webkitAudioContext;
      ctxRef.current = new Ctx();
      await ctxRef.current.resume().catch(() => undefined);
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      try {
        wakeRef.current = await (navigator as any).wakeLock?.request("screen");
      } catch {
        /* wake lock unsupported — fine */
      }
      setPhase("watching");
      void poll();
      pollRef.current = setInterval(poll, POLL_MS);
    } catch {
      setError(
        t(
          "Autorisez le microphone pour activer la veille.",
          "Allow the microphone to enable standby.",
        ),
      );
    }
  }, [poll, t]);

  // Re-acquire the wake lock when the tab becomes visible again.
  useEffect(() => {
    const onVisible = async () => {
      if (document.visibilityState === "visible" && phase !== "idle") {
        try {
          wakeRef.current = await (navigator as any).wakeLock?.request("screen");
        } catch {
          /* ignore */
        }
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [phase]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      wakeRef.current?.release?.().catch(() => undefined);
      ctxRef.current?.close().catch(() => undefined);
    };
  }, []);

  if (phase === "idle") {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-8 px-6 text-center">
        <h1 className="text-3xl font-bold">{t("Mode veille", "Standby")}</h1>
        <p className="text-white/85 text-lg max-w-sm leading-relaxed">
          {t(
            "L'appareil reste allumé et vous préviendra tout seul, à voix haute, quand c'est l'heure de vos médicaments.",
            "The device stays on and will alert you out loud, on its own, when it's time for your medication.",
          )}
        </p>
        <button
          onClick={start}
          className="w-56 h-56 rounded-full bg-white text-brand-700 text-2xl font-bold shadow-2xl active:scale-95"
        >
          {t("Démarrer", "Start")}
        </button>
        {error && (
          <p className="text-white bg-red-500/80 rounded-xl px-4 py-2">{error}</p>
        )}
        <button onClick={onExit} className="text-white/70 underline text-lg">
          {t("Retour", "Back")}
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="text-7xl font-light tabular-nums opacity-90">{clock}</div>

      {phase === "watching" ? (
        <p className="text-white/80 text-xl">
          {t("En veille 🔔", "On standby 🔔")}
          <br />
          <span className="text-base text-white/60">
            {t(
              "J'attends l'heure de vos médicaments.",
              "Waiting for medication time.",
            )}
          </span>
        </p>
      ) : (
        message && (
          <div className="bg-white text-gray-900 rounded-2xl px-6 py-5 text-2xl max-w-md leading-relaxed">
            {message}
          </div>
        )
      )}

      {phase === "result" && result && (
        <div className="bg-green-600/90 text-white rounded-xl px-5 py-3 text-lg max-w-md">
          {result}
        </div>
      )}

      <button onClick={onExit} className="mt-6 text-white/70 underline">
        {t("Quitter la veille", "Exit standby")}
      </button>
    </div>
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

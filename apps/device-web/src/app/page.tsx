"use client";
import { useCallback, useRef, useState } from "react";
import { converse, type ChatTurn } from "@/lib/api";

type Status = "idle" | "recording" | "thinking" | "speaking" | "error";

const RESIDENT_ID = "demo";

export default function CompanionDevicePage() {
  const [status, setStatus] = useState<Status>("idle");
  const [language, setLanguage] = useState<"fr" | "en">("fr");
  const [lastUser, setLastUser] = useState("");
  const [lastReply, setLastReply] = useState("");
  const [error, setError] = useState("");
  const [needsTapToHear, setNeedsTapToHear] = useState(false);

  const historyRef = useRef<ChatTurn[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const lastAudioUrlRef = useRef<string>("");

  const t = (fr: string, en: string) => (language === "fr" ? fr : en);

  const playAudio = useCallback((url: string) => {
    setNeedsTapToHear(false);
    const audio = new Audio(url);
    audio.onended = () => setStatus("idle");
    audio.onerror = () => setStatus("idle");
    setStatus("speaking");
    audio.play().catch(() => {
      // iOS may block playback outside a direct tap — offer a manual button.
      setStatus("idle");
      setNeedsTapToHear(true);
    });
  }, []);

  const startRecording = useCallback(async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => void handleStop();
      recorderRef.current = recorder;
      recorder.start();
      setStatus("recording");
    } catch {
      setError(
        t(
          "Je n'ai pas accès au micro. Touchez « Autoriser » quand le navigateur le demande.",
          "I can't access the microphone. Tap 'Allow' when the browser asks.",
        ),
      );
      setStatus("error");
    }
  }, [language]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
  }, []);

  async function handleStop() {
    setStatus("thinking");
    try {
      const blob = new Blob(chunksRef.current, {
        type: chunksRef.current[0]?.type || "audio/webm",
      });
      const audioBase64 = await blobToBase64(blob);

      const res = await converse({
        residentId: RESIDENT_ID,
        audioBase64,
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

      const url = `data:${res.audioMimeType};base64,${res.audioBase64}`;
      lastAudioUrlRef.current = url;
      playAudio(url);
    } catch {
      setError(t("Une erreur est survenue. Réessayez.", "Something went wrong. Try again."));
      setStatus("error");
    }
  }

  const busy = status === "thinking" || status === "speaking";

  const statusText =
    status === "recording"
      ? t("Je vous écoute…", "I'm listening…")
      : status === "thinking"
      ? t("Un instant…", "One moment…")
      : status === "speaking"
      ? t("Je vous réponds…", "Replying…")
      : t("Touchez pour parler", "Tap to talk");

  return (
    <main className="h-full flex flex-col items-center px-6 py-8 select-none">
      {/* Header */}
      <div className="w-full flex items-center justify-between max-w-md">
        <span className="text-xl font-semibold opacity-90">Compagnon</span>
        <div className="flex gap-1">
          {(["fr", "en"] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLanguage(l)}
              className={`px-3 py-1 rounded-lg text-sm font-medium ${
                language === l ? "bg-white text-brand-700" : "bg-brand-500/40 text-white"
              }`}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Big talk button + status */}
      <div className="flex-1 flex flex-col items-center justify-center gap-10 w-full">
        <p className="text-2xl font-medium text-center min-h-[2rem]">{statusText}</p>

        <button
          onClick={status === "recording" ? stopRecording : startRecording}
          disabled={busy}
          className={`w-64 h-64 rounded-full text-3xl font-bold shadow-2xl transition active:scale-95 disabled:opacity-70 ${
            status === "recording"
              ? "bg-red-500 text-white animate-pulse"
              : "bg-white text-brand-700"
          }`}
        >
          {status === "recording"
            ? t("Arrêter", "Stop")
            : busy
            ? "…"
            : t("Parler", "Talk")}
        </button>

        {needsTapToHear && lastAudioUrlRef.current && (
          <button
            onClick={() => playAudio(lastAudioUrlRef.current)}
            className="px-6 py-3 rounded-xl bg-white text-brand-700 text-lg font-semibold"
          >
            🔊 {t("Toucher pour écouter", "Tap to hear")}
          </button>
        )}
      </div>

      {/* Last exchange, shown large so it can also be read */}
      <div className="w-full max-w-md flex flex-col gap-3 min-h-[6rem]">
        {lastUser && (
          <p className="text-base text-white/70 text-right">« {lastUser} »</p>
        )}
        {lastReply && (
          <div className="bg-white text-gray-900 rounded-2xl px-5 py-4 text-xl leading-relaxed">
            {lastReply}
          </div>
        )}
        {error && <p className="text-center text-white bg-red-500/80 rounded-xl px-4 py-3">{error}</p>}
      </div>
    </main>
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

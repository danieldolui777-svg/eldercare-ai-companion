"use client";
import { useCallback, useRef, useState } from "react";
import { converse, type ChatTurn } from "@/lib/api";

type Status = "idle" | "recording" | "thinking" | "speaking" | "error";

const RESIDENT_ID = "demo";

export default function CompanionPage() {
  const [status, setStatus] = useState<Status>("idle");
  const [language, setLanguage] = useState<"fr" | "en">("fr");
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [error, setError] = useState("");
  const [lastAudioUrl, setLastAudioUrl] = useState<string>("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const t = (fr: string, en: string) => (language === "fr" ? fr : en);

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
      mediaRecorderRef.current = recorder;
      recorder.start();
      setStatus("recording");
    } catch {
      setError(
        t(
          "Impossible d'accéder au micro. Autorisez le microphone dans le navigateur.",
          "Cannot access the microphone. Please allow microphone access.",
        ),
      );
      setStatus("error");
    }
  }, [language]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
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
        history,
      });

      setHistory((h) => [
        ...h,
        { role: "user", content: res.transcript },
        { role: "assistant", content: res.reply },
      ]);

      const url = `data:${res.audioMimeType};base64,${res.audioBase64}`;
      setLastAudioUrl(url);
      setStatus("speaking");
      const audio = new Audio(url);
      audio.onended = () => setStatus("idle");
      audio.onerror = () => setStatus("idle");
      await audio.play().catch(() => setStatus("idle"));
    } catch (err: any) {
      setError(err?.message ?? "Erreur");
      setStatus("error");
    }
  }

  const busy = status === "thinking" || status === "speaking";

  return (
    <div className="max-w-xl mx-auto flex flex-col items-center text-center">
      <div className="flex items-center justify-between w-full mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {t("Compagnon", "Companion")}
        </h1>
        <div className="flex gap-1 text-sm">
          {(["fr", "en"] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLanguage(l)}
              className={`px-3 py-1 rounded-lg border ${
                language === l
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600"
              }`}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <p className="text-gray-500 mb-8">
        {status === "recording"
          ? t("Je vous écoute...", "I'm listening...")
          : status === "thinking"
          ? t("Je réfléchis...", "Thinking...")
          : status === "speaking"
          ? t("Je vous réponds...", "Replying...")
          : t(
              "Appuyez sur le bouton et parlez.",
              "Tap the button and speak.",
            )}
      </p>

      <button
        onClick={status === "recording" ? stopRecording : startRecording}
        disabled={busy}
        className={`w-44 h-44 rounded-full text-white text-xl font-semibold shadow-lg transition disabled:opacity-60 ${
          status === "recording"
            ? "bg-red-600 animate-pulse"
            : "bg-blue-600 hover:bg-blue-700"
        }`}
      >
        {status === "recording"
          ? t("Arrêter", "Stop")
          : busy
          ? "..."
          : t("Parler", "Talk")}
      </button>

      {lastAudioUrl && status !== "speaking" && (
        <button
          onClick={() => void new Audio(lastAudioUrl).play()}
          className="mt-4 text-sm text-blue-600 underline"
        >
          {t("Réécouter la réponse", "Play reply again")}
        </button>
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {history.length > 0 && (
        <div className="mt-10 w-full flex flex-col gap-3 text-left">
          {history.map((turn, i) => (
            <div
              key={i}
              className={`rounded-2xl px-4 py-3 max-w-[85%] ${
                turn.role === "user"
                  ? "bg-blue-600 text-white self-end"
                  : "bg-white border border-gray-200 text-gray-800 self-start"
              }`}
            >
              {turn.content}
            </div>
          ))}
        </div>
      )}
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

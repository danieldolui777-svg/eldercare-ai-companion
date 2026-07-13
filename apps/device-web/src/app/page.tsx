"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  converse,
  getBoundResident,
  getDeviceMe,
  getResidents,
  getDeviceToken,
  setDeviceToken,
  setOpenResidentId,
  clearDeviceToken,
  type ChatTurn,
  type DeviceResident,
  type ConverseResponse,
} from "@/lib/api";
import { Standby } from "./Standby";
import { AlwaysOn } from "./AlwaysOn";

type Status = "idle" | "recording" | "thinking" | "speaking" | "error";

export default function CompanionDevicePage() {
  const [status, setStatus] = useState<Status>("idle");
  const [language, setLanguage] = useState<"fr" | "en">("fr");
  const [lastUser, setLastUser] = useState("");
  const [lastReply, setLastReply] = useState("");
  const [error, setError] = useState("");
  const [needsTapToHear, setNeedsTapToHear] = useState(false);
  const [resident, setResident] = useState<DeviceResident | null>(null);
  const [residents, setResidents] = useState<DeviceResident[]>([]); // open mode only
  const [paired, setPaired] = useState<boolean | null>(null); // null = checking
  const openMode = !getDeviceToken();
  const [confirmation, setConfirmation] =
    useState<ConverseResponse["confirmation"]>(undefined);
  const [standby, setStandby] = useState(false);
  const [alwaysOn, setAlwaysOn] = useState(true);

  // Resolve the current resident: from the pairing token (secure) or, in open
  // mode, from the resident list (works like before, no login needed).
  const loadDevice = useCallback(async () => {
    try {
      const me = await getBoundResident();
      if (!me) { setPaired(false); return; } // secured API + no token → pairing
      setResident(me);
      setLanguage((me.language as "fr" | "en") ?? "fr");
      setPaired(true);
      if (!getDeviceToken()) {
        setResidents(await getResidents().catch(() => []));
      }
    } catch {
      // API is secured and this device has no valid token → show pairing.
      clearDeviceToken();
      setPaired(false);
    }
  }, []);

  useEffect(() => { loadDevice(); }, [loadDevice]);

  // Switch resident in open mode (remembered on this device).
  const chooseResident = useCallback((rid: string) => {
    setOpenResidentId(rid);
    const chosen = residents.find((r) => r.id === rid);
    if (chosen) {
      setResident(chosen);
      setLanguage((chosen.language as "fr" | "en") ?? "fr");
    }
    historyRef.current = [];
  }, [residents]);

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
      setConfirmation(res.confirmation);

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

  // Still checking the pairing token.
  if (paired === null) {
    return (
      <div className="h-full flex items-center justify-center text-white/60">
        …
      </div>
    );
  }

  // Not paired yet — show the pairing screen.
  if (!paired) {
    return <PairingScreen onPaired={loadDevice} />;
  }

  if (alwaysOn) {
    return (
      <AlwaysOn
        residentId={resident?.id ?? ""}
        residentName={resident?.preferredName ?? resident?.firstName}
        language={language}
        residents={openMode ? residents : undefined}
        onResidentChange={openMode ? chooseResident : undefined}
        onExit={() => setAlwaysOn(false)}
      />
    );
  }

  if (standby) {
    return (
      <Standby
        residentId={resident?.id ?? ""}
        language={language}
        onExit={() => setStandby(false)}
      />
    );
  }

  return (
    <main className="h-full flex flex-col items-center px-6 py-8 select-none">
      {/* Header */}
      <div className="w-full flex items-center justify-between max-w-md">
        <span className="text-xl font-semibold opacity-90">
          Compagnon{resident ? ` · ${resident.preferredName ?? resident.firstName}` : ""}
        </span>
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

      {/* Last exchange */}
      <div className="w-full max-w-md flex flex-col gap-3 min-h-[6rem]">
        {lastUser && (
          <p className="text-base text-white/70 text-right">« {lastUser} »</p>
        )}
        {lastReply && (
          <div className="bg-white text-gray-900 rounded-2xl px-5 py-4 text-xl leading-relaxed">
            {lastReply}
          </div>
        )}
        {confirmation && (
          <div className="text-center text-white bg-green-600/90 rounded-xl px-4 py-3 font-medium">
            {confirmation.status === "confirmed_taken"
              ? t(
                  `✓ ${confirmation.medicationName} : bien noté, c'est pris.`,
                  `✓ ${confirmation.medicationName}: noted as taken.`,
                )
              : confirmation.status === "confirmed_not_taken"
              ? t(
                  `${confirmation.medicationName} : noté comme non pris. Un soignant est prévenu.`,
                  `${confirmation.medicationName}: noted as not taken. A caregiver is notified.`,
                )
              : t(
                  `${confirmation.medicationName} : un soignant va vérifier.`,
                  `${confirmation.medicationName}: a caregiver will check.`,
                )}
          </div>
        )}
        {error && <p className="text-center text-white bg-red-500/80 rounded-xl px-4 py-3">{error}</p>}
      </div>

      <div className="flex flex-col gap-2 mt-4 w-full max-w-md">
        <button
          onClick={() => setAlwaysOn(true)}
          className="w-full px-5 py-4 rounded-xl bg-white text-brand-700 text-base font-bold shadow-lg active:scale-95"
        >
          🎙️ {t("Écoute permanente (sans bouton)", "Always listening (hands-free)")}
        </button>
        <button
          onClick={() => setStandby(true)}
          className="w-full px-5 py-3 rounded-xl bg-brand-500/40 text-white text-base font-medium"
        >
          🔔 {t("Mode veille (rappels automatiques)", "Standby (auto reminders)")}
        </button>
      </div>
    </main>
  );
}

/** First-run screen: paste the pairing code generated on the dashboard. */
function PairingScreen({ onPaired }: { onPaired: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setDeviceToken(code);
    try {
      await getDeviceMe(); // validates the token
      onPaired();
    } catch {
      clearDeviceToken();
      setError("Code invalide. Vérifiez-le sur le tableau de bord.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="h-full flex flex-col items-center justify-center gap-6 px-8 text-center">
      <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center text-5xl">📱</div>
      <h1 className="text-white text-2xl font-bold">Appairer cet appareil</h1>
      <p className="text-white/70 text-base max-w-xs leading-relaxed">
        Collez le code d&apos;appairage généré sur le tableau de bord (fiche du résident → Appareils).
      </p>
      <form onSubmit={submit} className="w-full max-w-xs flex flex-col gap-3">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Code d'appairage"
          className="w-full rounded-xl px-4 py-3 text-gray-900 text-center"
          autoFocus
        />
        {error && <p className="text-red-200 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className="w-full px-5 py-3 rounded-xl bg-white text-brand-700 font-bold disabled:opacity-50"
        >
          {busy ? "…" : "Appairer"}
        </button>
      </form>
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

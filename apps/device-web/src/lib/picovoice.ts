// Optional on-device wake-word engine (Picovoice Porcupine).
//
// Runs fully locally — no network round-trip — so the wake word is detected
// almost instantly, unlike the browser's Web Speech API which streams audio to
// Google. This is OPT-IN: it only runs when the user selects it in settings AND
// an access key is configured. The default flow (Web Speech API) is untouched.
//
// Setup required (one time):
//   1. Free access key from https://console.picovoice.ai
//      → set NEXT_PUBLIC_PICOVOICE_ACCESS_KEY in the device-web env.
//   2. The Porcupine model params file at /porcupine/porcupine_params.pv
//      (download from Picovoice — the English "porcupine_params.pv").
//   3. (Optional) a custom "Daniel" keyword .ppn at /porcupine/daniel.ppn,
//      trained for the "Web (WASM)" platform in the Picovoice console.
//      Without it, a built-in test keyword (e.g. "Computer") is used.

export interface WakeWordHandle {
  stop: () => Promise<void>;
}

export interface StartPicovoiceOptions {
  accessKey: string;
  onWake: () => void;
  /** Custom keyword model, e.g. "/porcupine/daniel.ppn". */
  keywordPath?: string;
  /** Built-in keyword name used when no custom model is provided. */
  builtinKeyword?: string;
  /** Path to the Porcupine model params (.pv). */
  modelPath?: string;
}

/**
 * Starts on-device wake-word listening. Resolves to a handle whose stop() fully
 * releases the microphone — call it before opening the Realtime session so the
 * two don't fight over the mic, then start again afterwards.
 */
export async function startPicovoice(
  opts: StartPicovoiceOptions,
): Promise<WakeWordHandle> {
  const { PorcupineWorker, BuiltInKeyword } = await import(
    "@picovoice/porcupine-web"
  );
  const { WebVoiceProcessor } = await import(
    "@picovoice/web-voice-processor"
  );

  const modelPath = opts.modelPath ?? "/porcupine/porcupine_params.pv";

  const keyword = opts.keywordPath
    ? { label: "Daniel", publicPath: opts.keywordPath }
    : {
        builtin:
          (BuiltInKeyword as Record<string, unknown>)[
            opts.builtinKeyword ?? "Computer"
          ],
      };

  const porcupine = await PorcupineWorker.create(
    opts.accessKey,
    keyword as any,
    () => opts.onWake(),
    { publicPath: modelPath },
  );

  await WebVoiceProcessor.subscribe(porcupine);

  return {
    stop: async () => {
      try {
        await WebVoiceProcessor.unsubscribe(porcupine);
      } catch {
        /* ignore */
      }
      try {
        porcupine.release();
      } catch {
        /* ignore */
      }
    },
  };
}

export const PICOVOICE_ACCESS_KEY =
  process.env.NEXT_PUBLIC_PICOVOICE_ACCESS_KEY ?? "";

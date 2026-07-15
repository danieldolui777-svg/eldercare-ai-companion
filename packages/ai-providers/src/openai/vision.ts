import OpenAI from "openai";

/** One medication line extracted from a prescription photo (a DRAFT, not truth). */
export interface PrescribedMedication {
  name: string;
  /** Dosage exactly as written, e.g. "500 mg". */
  dosage?: string;
  /** Free-text posology as written, e.g. "1 comprimé matin et soir". */
  instructions?: string;
  /** Times of day (HH:MM) only if the frequency clearly implies them. */
  times?: string[];
  prescriber?: string;
}

export interface PrescriptionDraft {
  medications: PrescribedMedication[];
  confidence: "high" | "medium" | "low";
  /** Anything unclear/illegible the caregiver should double-check. */
  notes?: string;
}

export interface PrescriptionScanInput {
  imageBase64: string;
  mimeType: string;
  language?: "fr" | "en";
}

export interface PrescriptionScanner {
  scan(input: PrescriptionScanInput): Promise<PrescriptionDraft>;
}

export interface OpenAiVisionOptions {
  apiKey: string;
  /** Vision-capable model. gpt-4.1 by default. */
  model?: string;
}

const VALID_CONFIDENCE = new Set(["high", "medium", "low"]);

/**
 * Reads a prescription photo and returns a STRUCTURED DRAFT for a caregiver to
 * review. Safety: it extracts only what is visibly written, never invents or
 * infers a medication or a dose. The backend + a human remain the source of
 * truth — nothing here is committed automatically.
 */
export class OpenAiPrescriptionScanner implements PrescriptionScanner {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: OpenAiVisionOptions) {
    this.client = new OpenAI({ apiKey: options.apiKey });
    this.model = options.model ?? "gpt-4.1";
  }

  async scan(input: PrescriptionScanInput): Promise<PrescriptionDraft> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0,
      max_tokens: 800,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You read a photo of a medical prescription (ordonnance) and extract",
            "EXACTLY what is written, as structured data, for a caregiver to review.",
            "",
            "STRICT SAFETY RULES:",
            "- Extract ONLY medications and doses that are clearly written.",
            "- NEVER invent, guess, complete, or infer a medication, a dose, or a",
            "  posology that is not clearly legible. When unsure, leave the field",
            "  empty, lower the confidence, and explain in notes.",
            "- You are NOT making a medical decision. This is a draft; a human",
            "  caregiver verifies and confirms everything.",
            "- Times: only fill `times` (HH:MM) when the frequency clearly implies",
            "  them (e.g. 'matin et soir' -> 08:00, 20:00). Otherwise leave empty.",
            "",
            'Respond ONLY with JSON: {"medications":[{"name","dosage","instructions",',
            '"times":["HH:MM"],"prescriber"}], "confidence":"high|medium|low", "notes"}.',
            "Empty medications list if nothing is legible.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                input.language === "en"
                  ? "Extract the prescription from this image."
                  : "Extrais l'ordonnance de cette image.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${input.mimeType};base64,${input.imageBase64}`,
              },
            },
          ] as any,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return { medications: [], confidence: "low", notes: "Empty response" };

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { medications: [], confidence: "low", notes: "Could not parse" };
    }

    const meds: PrescribedMedication[] = Array.isArray(parsed.medications)
      ? parsed.medications
          .filter((m: any) => m && typeof m.name === "string" && m.name.trim())
          .map((m: any) => ({
            name: String(m.name).trim().slice(0, 200),
            dosage: m.dosage ? String(m.dosage).trim().slice(0, 100) : undefined,
            instructions: m.instructions
              ? String(m.instructions).trim().slice(0, 300)
              : undefined,
            times: Array.isArray(m.times)
              ? m.times
                  .filter((t: any) => typeof t === "string" && /^\d{1,2}:\d{2}$/.test(t))
                  .slice(0, 6)
              : undefined,
            prescriber: m.prescriber
              ? String(m.prescriber).trim().slice(0, 200)
              : undefined,
          }))
      : [];

    const confidence = VALID_CONFIDENCE.has(parsed.confidence)
      ? parsed.confidence
      : "low";

    return {
      medications: meds,
      confidence,
      notes: parsed.notes ? String(parsed.notes).slice(0, 500) : undefined,
    };
  }
}

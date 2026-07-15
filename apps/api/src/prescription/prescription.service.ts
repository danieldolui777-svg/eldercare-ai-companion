import { Injectable, Logger } from "@nestjs/common";
import {
  OpenAiPrescriptionScanner,
  type PrescriptionDraft,
} from "@eldercare/ai-providers";
import { AuditService } from "../audit/audit.service";

export interface ScanInput {
  residentId?: string;
  imageBase64: string;
  mimeType: string;
  language?: "fr" | "en";
}

/**
 * Extracts a STRUCTURED DRAFT from a prescription photo. It never writes to the
 * medication tables — a caregiver reviews the draft and commits it through the
 * normal (deterministic, audited) medication endpoints. Backend owns the truth.
 */
@Injectable()
export class PrescriptionService {
  private readonly logger = new Logger(PrescriptionService.name);
  private readonly scanner: OpenAiPrescriptionScanner;
  private readonly configured: boolean;

  constructor(private readonly audit: AuditService) {
    const apiKey = process.env.OPENAI_API_KEY ?? "";
    this.configured = apiKey.length > 0;
    this.scanner = new OpenAiPrescriptionScanner({
      apiKey,
      model: process.env.PRESCRIPTION_MODEL,
    });
  }

  async scan(input: ScanInput): Promise<PrescriptionDraft> {
    if (!this.configured) {
      throw new Error("Prescription scanning is not configured (missing OPENAI_API_KEY).");
    }
    let draft: PrescriptionDraft;
    try {
      draft = await this.scanner.scan({
        imageBase64: input.imageBase64,
        mimeType: input.mimeType,
        language: input.language,
      });
    } catch (err) {
      // Bad/unreadable image, oversized, etc. — fail gracefully, not a 500.
      this.logger.warn(`prescription scan failed: ${(err as Error).message}`);
      return {
        medications: [],
        confidence: "low",
        notes: "Image illisible ou trop volumineuse. Réessayez avec une photo nette et bien cadrée.",
      };
    }
    // Audit metadata only — never the image or full extracted content.
    await this.audit
      .log({
        actorType: "ai",
        action: "prescription.scanned",
        entityType: "Resident",
        entityId: input.residentId ?? "unknown",
        metadata: {
          medications: draft.medications.length,
          confidence: draft.confidence,
        },
      })
      .catch(() => undefined);
    return draft;
  }
}

import { Injectable, Logger } from "@nestjs/common";
import {
  OpenAiCompanionChatProvider,
  type ConversationExchange,
} from "@eldercare/ai-providers";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

/**
 * Owns the companion's long-term memory of a resident.
 *
 * Two separate stores, both consent-gated (data boundary):
 *  - Curated memory (default ON): distilled, NON-MEDICAL facts extracted by the
 *    LLM and injected back into future conversations so the companion remembers
 *    the person. Opt out with privacySettings.storeMemory === false.
 *  - Verbatim transcript (default OFF): raw turns, only when the resident has
 *    consented via privacySettings.storeTranscripts === true.
 *
 * Medical/reminder data never flows in here; the deterministic backend owns it.
 */
@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);
  private readonly chat: OpenAiCompanionChatProvider;
  private readonly configured: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {
    const apiKey = process.env.OPENAI_API_KEY ?? "";
    this.configured = apiKey.length > 0;
    this.chat = new OpenAiCompanionChatProvider({ apiKey });
  }

  /** Full curated-memory rows for a resident (caregiver review). */
  async listForResident(residentId: string) {
    return this.prisma.residentMemory.findMany({
      where: { residentId },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Delete a single curated fact (caregiver correction). */
  async deleteFact(id: string) {
    return this.prisma.residentMemory
      .delete({ where: { id } })
      .catch(() => null);
  }

  /** Curated fact strings for prompt injection (most recent first). */
  async loadFacts(residentId: string, limit = 30): Promise<string[]> {
    if (!residentId || residentId === "demo") return [];
    const rows = await this.prisma.residentMemory
      .findMany({
        where: { residentId },
        orderBy: { createdAt: "desc" },
        take: limit,
      })
      .catch(() => [] as { content: string }[]);
    return rows.map((r) => r.content);
  }

  /**
   * Persist memory from a finished exchange. Extracts + stores curated facts by
   * default; stores verbatim turns only with explicit consent. Never throws —
   * memory is best-effort and must not break a conversation.
   */
  async recordConversation(
    residentId: string,
    exchanges: ConversationExchange[],
  ): Promise<void> {
    if (!this.configured || !residentId || residentId === "demo") return;
    const clean = exchanges.filter((e) => e.content?.trim());
    if (clean.length === 0) return;

    const resident = await this.prisma.resident
      .findUnique({ where: { id: residentId } })
      .catch(() => null);
    if (!resident) return;

    const consented =
      resident.consentStatus === "granted" ||
      resident.consentStatus === "guardian_granted";
    if (!consented) return;

    const privacy = (resident.privacySettings ?? {}) as {
      allowAiConversation?: boolean;
      storeMemory?: boolean;
      storeTranscripts?: boolean;
    };
    if (privacy.allowAiConversation === false) return;

    // 1. Verbatim transcript — opt-in only.
    if (privacy.storeTranscripts === true) {
      await this.prisma.conversationEntry
        .createMany({
          data: clean.map((e) => ({
            residentId,
            role: e.role,
            content: e.content.slice(0, 2000),
          })),
        })
        .catch((err) =>
          this.logger.warn(`transcript store failed: ${(err as Error).message}`),
        );
    }

    // 2. Curated memory — default on, opt out with storeMemory === false.
    if (privacy.storeMemory === false) return;
    try {
      const existing = await this.loadFacts(residentId, 50);
      const facts = await this.chat.extractMemoryFacts({
        exchanges: clean,
        existingFacts: existing,
      });
      const seen = new Set(existing.map((e) => e.toLowerCase()));
      const fresh = facts.filter((f) => !seen.has(f.content.toLowerCase()));
      if (fresh.length > 0) {
        await this.prisma.residentMemory.createMany({
          data: fresh.map((f) => ({
            residentId,
            category: f.category,
            content: f.content,
          })),
        });
        await this.audit.log({
          actorType: "ai",
          action: "memory.updated",
          entityType: "Resident",
          entityId: residentId,
          metadata: { added: fresh.length },
        });
      }
    } catch (err) {
      this.logger.warn(`memory extraction failed: ${(err as Error).message}`);
    }
  }
}

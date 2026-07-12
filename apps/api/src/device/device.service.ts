import { Injectable } from "@nestjs/common";
import { randomBytes, createHash } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Device pairing + authentication. A device is bound to ONE resident. The raw
 * token is shown once at pairing; only its SHA-256 hash is stored, and lookups
 * are by hash (tokens are high-entropy random, so a fast hash is appropriate).
 */
@Injectable()
export class DeviceService {
  constructor(private readonly prisma: PrismaService) {}

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  /** Create a new device token for a resident. Returns the RAW token once. */
  async createToken(residentId: string, label?: string) {
    const raw = randomBytes(32).toString("base64url");
    const rec = await this.prisma.deviceToken.create({
      data: { residentId, tokenHash: this.hashToken(raw), label: label ?? null },
    });
    return { id: rec.id, token: raw, label: rec.label, createdAt: rec.createdAt };
  }

  /** Resolve a raw device token to its resident id, or null if invalid/revoked. */
  async resolveResidentId(rawToken: string | undefined): Promise<string | null> {
    if (!rawToken) return null;
    const rec = await this.prisma.deviceToken
      .findUnique({ where: { tokenHash: this.hashToken(rawToken) } })
      .catch(() => null);
    if (!rec || rec.revokedAt) return null;
    // Best-effort "last seen" update; never blocks the request.
    this.prisma.deviceToken
      .update({ where: { id: rec.id }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
    return rec.residentId;
  }

  /** Devices paired to a resident (hashes only — never returns the raw token). */
  async listForResident(residentId: string) {
    return this.prisma.deviceToken.findMany({
      where: { residentId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        label: true,
        createdAt: true,
        lastSeenAt: true,
        revokedAt: true,
      },
    });
  }

  async revoke(id: string) {
    return this.prisma.deviceToken
      .update({ where: { id }, data: { revokedAt: new Date() } })
      .catch(() => null);
  }
}

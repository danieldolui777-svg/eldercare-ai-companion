import { describe, it, expect, vi } from "vitest";
import * as bcrypt from "bcryptjs";
import { AuthService } from "./auth.service";

function build(caregiver: any) {
  const prisma = {
    caregiver: { findUnique: vi.fn().mockResolvedValue(caregiver) },
  };
  const jwt = { signAsync: vi.fn().mockResolvedValue("signed-token") };
  const audit = { log: vi.fn().mockResolvedValue(undefined) };
  return new AuthService(prisma as any, jwt as any, audit as any);
}

const withHash = async (over: Partial<any> = {}) => ({
  id: "c1",
  name: "Alice",
  role: "admin",
  email: "alice@example.com",
  passwordHash: await bcrypt.hash("password123", 12),
  ...over,
});

describe("AuthService.login", () => {
  it("issues a token for correct credentials", async () => {
    const svc = build(await withHash());
    const res = await svc.login("alice@example.com", "password123");
    expect(res.accessToken).toBe("signed-token");
    expect(res.caregiver.id).toBe("c1");
    expect(res.caregiver.role).toBe("admin");
  });

  it("rejects a wrong password", async () => {
    const svc = build(await withHash());
    await expect(svc.login("alice@example.com", "wrong")).rejects.toThrow();
  });

  it("rejects an unknown email", async () => {
    const svc = build(null);
    await expect(svc.login("nobody@example.com", "whatever")).rejects.toThrow();
  });

  it("rejects a caregiver with no password set", async () => {
    const svc = build(await withHash({ passwordHash: null }));
    await expect(svc.login("alice@example.com", "whatever")).rejects.toThrow();
  });
});

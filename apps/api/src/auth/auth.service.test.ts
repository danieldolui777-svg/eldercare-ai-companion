import { describe, it, expect, vi, afterEach } from "vitest";
import * as bcrypt from "bcryptjs";
import { ExecutionContext } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { AdminGuard } from "./admin.guard";

function build(caregiver: any) {
  const prisma = {
    caregiver: { findUnique: vi.fn().mockResolvedValue(caregiver) },
  };
  const jwt = { signAsync: vi.fn().mockResolvedValue("signed-token") };
  const audit = { log: vi.fn().mockResolvedValue(undefined) };
  return new AuthService(prisma as any, jwt as any, audit as any);
}

/** AuthService with a fully controllable prisma double, for account flows. */
function buildWithPrisma(prisma: any) {
  const jwt = { signAsync: vi.fn().mockResolvedValue("signed-token") };
  const audit = { log: vi.fn().mockResolvedValue(undefined) };
  return {
    svc: new AuthService(prisma as any, jwt as any, audit as any),
    audit,
  };
}

const ctxWithUser = (user: any): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as any;

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

describe("AuthService.createAccount", () => {
  const input = {
    name: "Bob",
    email: "Bob@Example.com ",
    role: "nurse" as const,
    password: "password123",
  };

  it("creates a caregiver whose password actually verifies", async () => {
    const create = vi.fn().mockResolvedValue({ id: "c2" });
    const { svc } = buildWithPrisma({
      caregiver: { findUnique: vi.fn().mockResolvedValue(null), create },
    });

    await svc.createAccount(input, "admin-1");

    const data = create.mock.calls[0][0].data;
    expect(data.email).toBe("bob@example.com"); // normalized
    expect(data.passwordHash).not.toBe("password123"); // never stored in clear
    expect(await bcrypt.compare("password123", data.passwordHash)).toBe(true);
  });

  it("refuses to overwrite an existing account", async () => {
    const create = vi.fn();
    const { svc } = buildWithPrisma({
      caregiver: {
        findUnique: vi.fn().mockResolvedValue({ id: "existing" }),
        create,
      },
    });

    await expect(svc.createAccount(input, "admin-1")).rejects.toThrow(
      /already exists/i,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("audits the creation", async () => {
    const { svc, audit } = buildWithPrisma({
      caregiver: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "c2" }),
      },
    });

    await svc.createAccount(input, "admin-1");

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth.account_created",
        actorId: "admin-1",
        entityId: "c2",
      }),
    );
  });
});

describe("AuthService.setPasswordById", () => {
  it("hashes the new password and audits the reset", async () => {
    const update = vi.fn().mockResolvedValue({});
    const { svc, audit } = buildWithPrisma({
      caregiver: {
        findUnique: vi.fn().mockResolvedValue({ id: "c2" }),
        update,
      },
    });

    await svc.setPasswordById("c2", "newpassword1", "admin-1");

    const data = update.mock.calls[0][0].data;
    expect(await bcrypt.compare("newpassword1", data.passwordHash)).toBe(true);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "auth.password_reset", entityId: "c2" }),
    );
  });

  it("rejects an unknown caregiver", async () => {
    const { svc } = buildWithPrisma({
      caregiver: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() },
    });
    await expect(svc.setPasswordById("nope", "newpassword1")).rejects.toThrow();
  });
});

describe("AuthService.listAccounts", () => {
  it("reports sign-in capability without leaking the hash", async () => {
    const { svc } = buildWithPrisma({
      caregiver: {
        findMany: vi.fn().mockResolvedValue([
          { id: "c1", name: "Alice", email: "a@x.fr", role: "admin", passwordHash: "$2a$hash" },
          { id: "c2", name: "Bob", email: "b@x.fr", role: "nurse", passwordHash: null },
        ]),
      },
    });

    const rows = await svc.listAccounts();

    expect(rows[0]).not.toHaveProperty("passwordHash");
    expect(rows[0].canLogIn).toBe(true);
    expect(rows[1].canLogIn).toBe(false);
  });
});

describe("AdminGuard", () => {
  afterEach(() => {
    delete process.env.AUTH_DISABLED;
  });

  it("allows an admin when auth is enforced", () => {
    process.env.AUTH_DISABLED = "false";
    expect(new AdminGuard().canActivate(ctxWithUser({ role: "admin" }))).toBe(true);
  });

  it("blocks a non-admin caregiver when auth is enforced", () => {
    process.env.AUTH_DISABLED = "false";
    expect(() =>
      new AdminGuard().canActivate(ctxWithUser({ role: "nurse" })),
    ).toThrow(/administrator/i);
  });

  it("blocks an anonymous caller when auth is enforced", () => {
    process.env.AUTH_DISABLED = "false";
    expect(() => new AdminGuard().canActivate(ctxWithUser(undefined))).toThrow();
  });

  it("allows anyone in open mode, mirroring AuthGuard", () => {
    // AUTH_DISABLED unset → prototype open mode; the whole API is open anyway.
    expect(new AdminGuard().canActivate(ctxWithUser(undefined))).toBe(true);
  });
});

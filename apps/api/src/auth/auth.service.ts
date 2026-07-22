import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import type { CreateCaregiverAccount } from "@eldercare/domain";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

const BCRYPT_ROUNDS = 12;

export interface LoginResult {
  accessToken: string;
  caregiver: { id: string; name: string; role: string; email: string };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  /** Verify email + password and issue a caregiver JWT. */
  async login(email: string, password: string): Promise<LoginResult> {
    const caregiver = await this.prisma.caregiver.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    // Always run a comparison to avoid leaking whether the email exists (timing).
    const hash = caregiver?.passwordHash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva";
    const ok = await bcrypt.compare(password, hash);
    if (!caregiver || !caregiver.passwordHash || !ok) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const accessToken = await this.jwt.signAsync({
      sub: caregiver.id,
      role: caregiver.role,
      name: caregiver.name,
      email: caregiver.email,
    });

    await this.audit
      .log({
        actorType: "caregiver",
        actorId: caregiver.id,
        action: "auth.login",
        entityType: "Caregiver",
        entityId: caregiver.id,
      })
      .catch(() => undefined);

    return {
      accessToken,
      caregiver: {
        id: caregiver.id,
        name: caregiver.name,
        role: caregiver.role,
        email: caregiver.email,
      },
    };
  }

  /** Set/reset a caregiver's password (used by admin flows and bootstrap). */
  async setPassword(email: string, password: string): Promise<void> {
    if (password.length < 8) {
      throw new BadRequestException("Password must be at least 8 characters");
    }
    const passwordHash = await this.hashPassword(password);
    await this.prisma.caregiver.update({
      where: { email: email.toLowerCase().trim() },
      data: { passwordHash },
    });
  }

  /** Caregivers with account metadata. Never exposes passwordHash. */
  listAccounts() {
    return this.prisma.caregiver.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        passwordHash: true,
        createdAt: true,
      },
    }).then((rows) =>
      rows.map(({ passwordHash, ...rest }) => ({
        ...rest,
        // Surfacing only whether sign-in is possible, not the hash itself.
        canLogIn: Boolean(passwordHash),
      })),
    );
  }

  /**
   * Create a login-capable caregiver. Unlike bootstrapAdmin this does NOT
   * upsert: overwriting an existing account's password must be an explicit
   * reset, never a side effect of a mistyped "create".
   */
  async createAccount(
    input: CreateCaregiverAccount,
    actorId?: string,
  ): Promise<{ id: string }> {
    const email = input.email.toLowerCase().trim();
    const existing = await this.prisma.caregiver.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException("A caregiver with this email already exists");
    }
    const passwordHash = await this.hashPassword(input.password);
    const caregiver = await this.prisma.caregiver.create({
      data: {
        name: input.name,
        email,
        role: input.role,
        phone: input.phone,
        passwordHash,
        notificationPreferences: {},
      },
    });
    await this.audit
      .log({
        actorType: "caregiver",
        actorId: actorId ?? "unknown",
        action: "auth.account_created",
        entityType: "Caregiver",
        entityId: caregiver.id,
      })
      .catch(() => undefined);
    return { id: caregiver.id };
  }

  /** Admin reset of another caregiver's password, by id. */
  async setPasswordById(
    id: string,
    password: string,
    actorId?: string,
  ): Promise<void> {
    const caregiver = await this.prisma.caregiver.findUnique({ where: { id } });
    if (!caregiver) throw new NotFoundException("Caregiver not found");

    const passwordHash = await this.hashPassword(password);
    await this.prisma.caregiver.update({ where: { id }, data: { passwordHash } });

    await this.audit
      .log({
        actorType: "caregiver",
        actorId: actorId ?? "unknown",
        action: "auth.password_reset",
        entityType: "Caregiver",
        entityId: id,
      })
      .catch(() => undefined);
  }

  /**
   * One-time bootstrap of the first admin, gated by an env secret so the endpoint
   * is safe to leave mounted. Creates the admin if missing, else sets its password.
   */
  async bootstrapAdmin(
    secret: string,
    email: string,
    password: string,
    name = "Admin",
  ): Promise<{ id: string }> {
    const expected = process.env.ADMIN_BOOTSTRAP_SECRET ?? "";
    if (!expected || secret !== expected) {
      throw new UnauthorizedException("Invalid bootstrap secret");
    }
    if (password.length < 8) {
      throw new BadRequestException("Password must be at least 8 characters");
    }
    const passwordHash = await this.hashPassword(password);
    const normalized = email.toLowerCase().trim();
    const caregiver = await this.prisma.caregiver.upsert({
      where: { email: normalized },
      update: { passwordHash },
      create: {
        email: normalized,
        name,
        role: "admin",
        passwordHash,
        notificationPreferences: {},
      },
    });
    this.logger.warn(`Admin bootstrapped: ${normalized}`);
    return { id: caregiver.id };
  }
}

import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
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

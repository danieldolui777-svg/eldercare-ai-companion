import { Module, Logger } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { AuditModule } from "../audit/audit.module";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtAuthGuard } from "./jwt-auth.guard";

const secret = process.env.JWT_SECRET ?? "";
if (!secret) {
  // Never run in production without a real secret set on the host.
  new Logger("AuthModule").warn(
    "JWT_SECRET is not set — using an insecure dev fallback. Set JWT_SECRET in the environment.",
  );
}

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    JwtModule.register({
      secret: secret || "dev-insecure-secret-change-me",
      signOptions: { expiresIn: "12h" },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  exports: [AuthService, JwtAuthGuard, JwtModule],
})
export class AuthModule {}

import { Module, Logger } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { AuditModule } from "../audit/audit.module";
import { DeviceModule } from "../device/device.module";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { AuthGuard } from "./auth.guard";
import { AdminGuard } from "./admin.guard";

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
    DeviceModule,
    JwtModule.register({
      secret: secret || "dev-insecure-secret-change-me",
      signOptions: { expiresIn: "12h" },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAuthGuard,
    AdminGuard,
    // Global: every route requires auth unless @Public() / @DeviceRoute().
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthService, JwtAuthGuard, JwtModule],
})
export class AuthModule {}

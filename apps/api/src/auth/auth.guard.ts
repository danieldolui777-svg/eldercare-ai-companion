import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { IS_PUBLIC_KEY } from "./public.decorator";
import { DEVICE_ROUTE_KEY } from "../device/device.decorators";
import { DeviceService } from "../device/device.service";

/**
 * Global authentication guard. Every route requires auth unless marked @Public().
 *   - @Public()      → open (login, bootstrap).
 *   - @DeviceRoute() → X-Device-Token header, resolved to a resident id.
 *   - otherwise      → caregiver Bearer JWT.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly devices: DeviceService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = <T>(key: string) =>
      this.reflector.getAllAndOverride<T>(key, [
        context.getHandler(),
        context.getClass(),
      ]);

    if (meta<boolean>(IS_PUBLIC_KEY)) return true;

    const req = context.switchToHttp().getRequest();

    // Device-authenticated route.
    if (meta<boolean>(DEVICE_ROUTE_KEY)) {
      const token: string | undefined =
        req.headers?.["x-device-token"] ?? undefined;
      const residentId = await this.devices.resolveResidentId(token);
      if (!residentId) throw new UnauthorizedException("Invalid device token");
      req.deviceResidentId = residentId;
      return true;
    }

    // Caregiver-authenticated route.
    const header: string = req.headers?.authorization ?? "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) {
      throw new UnauthorizedException("Missing bearer token");
    }
    try {
      req.user = await this.jwt.verifyAsync(token);
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
  }
}

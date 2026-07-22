import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { AuthUser } from "./current-user.decorator";

/**
 * Restricts a route to caregivers with role "admin". Runs after the global
 * AuthGuard, so req.user is already populated when a valid JWT was supplied.
 *
 * Mirrors AuthGuard's open-mode rule: when AUTH_DISABLED is not explicitly
 * "false" the whole API is open anyway, so rejecting here would only block the
 * operator from bootstrapping their first accounts without adding any real
 * protection. Set AUTH_DISABLED=false to enforce.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (process.env.AUTH_DISABLED !== "false") return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user as AuthUser | undefined;
    if (user?.role !== "admin") {
      throw new ForbiddenException("Administrator role required");
    }
    return true;
  }
}

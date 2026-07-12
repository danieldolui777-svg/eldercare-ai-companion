import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export interface AuthUser {
  /** Caregiver id. */
  sub: string;
  role: string;
  name: string;
  email: string;
}

/** Injects the authenticated caregiver (set by JwtAuthGuard) into a handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
    const req = ctx.switchToHttp().getRequest();
    return req.user as AuthUser | undefined;
  },
);

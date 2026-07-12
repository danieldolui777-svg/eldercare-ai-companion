import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { z } from "zod";
import { AuthService } from "./auth.service";
import { ZodPipe } from "../common/zod.pipe";
import { Public } from "./public.decorator";
import { CurrentUser, type AuthUser } from "./current-user.decorator";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const BootstrapSchema = z.object({
  secret: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  login(@Body(new ZodPipe(LoginSchema)) body: any) {
    return this.auth.login(body.email, body.password);
  }

  // Safe to leave mounted: only works with the correct ADMIN_BOOTSTRAP_SECRET env.
  @Public()
  @Post("bootstrap-admin")
  @HttpCode(HttpStatus.OK)
  bootstrap(@Body(new ZodPipe(BootstrapSchema)) body: any) {
    return this.auth.bootstrapAdmin(
      body.secret,
      body.email,
      body.password,
      body.name,
    );
  }

  // Protected by the global guard — returns the caller's identity.
  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}

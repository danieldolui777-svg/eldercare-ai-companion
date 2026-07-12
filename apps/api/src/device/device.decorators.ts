import { SetMetadata, createParamDecorator, ExecutionContext } from "@nestjs/common";

/** Marks a route as device-authenticated (X-Device-Token header) instead of
 *  caregiver JWT. The global AuthGuard resolves the token to a resident id. */
export const DEVICE_ROUTE_KEY = "deviceRoute";
export const DeviceRoute = () => SetMetadata(DEVICE_ROUTE_KEY, true);

/** Injects the resident id resolved from the device token. */
export const DeviceResidentId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const req = ctx.switchToHttp().getRequest();
    return req.deviceResidentId as string | undefined;
  },
);

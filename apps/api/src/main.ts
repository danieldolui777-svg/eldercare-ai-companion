import "reflect-metadata";
import { webcrypto } from "node:crypto";

// Ensure the global Web Crypto API is available on older Node runtimes
// (e.g. Node 18). @nestjs/schedule relies on crypto.randomUUID().
if (!(globalThis as { crypto?: unknown }).crypto) {
  (globalThis as { crypto?: unknown }).crypto = webcrypto;
}

import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { WebSocketServer } from "ws";
import { AppModule } from "./app.module";
import { RealtimeHandler } from "./realtime/realtime.handler";
import { DeviceService } from "./device/device.service";

async function bootstrap() {
  const port = parseInt(process.env.PORT ?? "3000", 10);
  const isDev = process.env.NODE_ENV !== "production";

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // 15 MB body limit so base64-encoded voice clips fit in JSON requests.
    new FastifyAdapter({ logger: isDev, bodyLimit: 15 * 1024 * 1024 }),
  );

  app.setGlobalPrefix("api/v1");
  app.enableCors();

  await app.listen(port, "0.0.0.0");

  // Attach a raw WebSocket server alongside Fastify for the Realtime API proxy.
  // NestJS WebSocket gateways require the Express adapter; we bypass that by
  // grabbing the underlying Node http.Server from the Fastify instance directly.
  const fastify = app.getHttpServer() as any;
  const httpServer = (fastify?.server ?? fastify) as import("http").Server;
  const wss = new WebSocketServer({ server: httpServer, path: "/voice/realtime" });
  const handler = app.get(RealtimeHandler);
  const devices = app.get(DeviceService);
  wss.on("connection", async (ws, req) => {
    // Authenticate the device: the resident id comes from the token, never the
    // query — a paired device can only open a session for its own resident.
    const url = new URL(req.url ?? "/", "http://localhost");
    const token = url.searchParams.get("token") ?? undefined;
    let residentId = await devices.resolveResidentId(token).catch(() => null);
    // Open mode (default unless AUTH_DISABLED=false): fall back to residentId query.
    if (!residentId && process.env.AUTH_DISABLED !== "false") {
      residentId = url.searchParams.get("residentId");
    }
    if (!residentId) {
      ws.close(4001, "Invalid device token");
      return;
    }
    handler.handle(ws, req, residentId).catch((err: Error) => {
      console.error("RealtimeHandler error", err.message);
      ws.close();
    });
  });

  console.log(`API running on port ${port}`);
  console.log(`Realtime proxy ready at ws://…/voice/realtime`);
}

bootstrap();

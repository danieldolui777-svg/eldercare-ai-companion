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
import { AppModule } from "./app.module";

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
  console.log(`API running on port ${port}`);
}

bootstrap();

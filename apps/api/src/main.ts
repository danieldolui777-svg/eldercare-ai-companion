import "reflect-metadata";
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
    new FastifyAdapter({ logger: isDev }),
  );

  app.setGlobalPrefix("api/v1");
  app.enableCors();

  await app.listen(port, "0.0.0.0");
  console.log(`API running on port ${port}`);
}

bootstrap();

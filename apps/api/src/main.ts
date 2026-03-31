import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.API_PORT ?? 4000);

  app.enableCors({
    origin: true,
    credentials: true
  });

  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`PharmaHub API listening on http://localhost:${port}`);
}

void bootstrap();

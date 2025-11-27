import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import * as path from "path";
import * as express from "express";

async function bootstrap() {
  // Load env vars
  require("dotenv").config();

  const app = await NestFactory.create(AppModule);

  // Static files
  app.use(express.static(path.join(__dirname, "../public")));

  // Port
  const port = process.env.PORT || 9001;

  // Enable CORS if needed
  app.enableCors();

  await app.listen(port);
  console.log(`✅ NestJS CI/CD Server is running on http://localhost:${port}`);
}
bootstrap();

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { defineConfig, env } from "prisma/config";

const rootDirectory = fileURLToPath(new URL(".", import.meta.url));
loadEnv({
  path: resolve(rootDirectory, ".env")
});

export default defineConfig({
  schema: "packages/database/prisma/schema.prisma",
  migrations: {
    path: "packages/database/prisma/migrations"
  },
  datasource: {
    url: env("DATABASE_URL")
  }
});

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { Client } from "pg";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "../../src/app.module";

const repoRoot = resolve(__dirname, "../../../../..");
const prismaBinary = resolve(repoRoot, "node_modules/.bin/prisma");

loadEnv({
  path: resolve(repoRoot, ".env")
});

function createTestDatabaseUrl() {
  const source =
    process.env.TEST_DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:5432/pharmahub?schema=auth_e2e";

  const url = new URL(source);
  const baseDatabaseName = url.pathname.replace(/^\//, "") || "pharmahub";
  const testDatabaseName = `${baseDatabaseName}_auth_e2e_${randomUUID()
    .replace(/-/g, "")
    .slice(0, 12)}`.toLowerCase();

  url.pathname = `/${testDatabaseName}`;
  url.searchParams.set("schema", "public");

  return url;
}

function getAdminDatabaseUrl(databaseUrl: URL) {
  const adminUrl = new URL(databaseUrl.toString());
  adminUrl.pathname = "/postgres";
  adminUrl.searchParams.delete("schema");
  return adminUrl;
}

async function dropDatabase(databaseUrl: URL) {
  const databaseName = databaseUrl.pathname.replace(/^\//, "");

  if (!/^[a-z0-9_]+$/.test(databaseName)) {
    throw new Error(`Unsafe test database name: ${databaseName}`);
  }

  const client = new Client({
    connectionString: getAdminDatabaseUrl(databaseUrl).toString()
  });

  await client.connect();
  await client.query(
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
    [databaseName]
  );
  await client.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
  await client.end();
}

async function createDatabase(databaseUrl: URL) {
  const databaseName = databaseUrl.pathname.replace(/^\//, "");

  if (!/^[a-z0-9_]+$/.test(databaseName)) {
    throw new Error(`Unsafe test database name: ${databaseName}`);
  }

  const client = new Client({
    connectionString: getAdminDatabaseUrl(databaseUrl).toString()
  });

  await client.connect();
  await client.query(`CREATE DATABASE "${databaseName}"`);
  await client.end();
}

function applyMigrations(databaseUrl: URL) {
  execFileSync(prismaBinary, ["migrate", "deploy", "--config", "prisma.config.ts"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl.toString()
    },
    stdio: "pipe"
  });
}

export type TestAppContext = {
  app: INestApplication;
  baseUrl: string;
  close: () => Promise<void>;
};

export async function createTestApp() {
  const databaseUrl = createTestDatabaseUrl();

  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET ??= "pharmahub-test-secret";
  process.env.JWT_EXPIRES_IN ??= "1d";
  process.env.PASSWORD_SALT_ROUNDS ??= "4";
  process.env.DATABASE_URL = databaseUrl.toString();

  await dropDatabase(databaseUrl);
  await createDatabase(databaseUrl);
  applyMigrations(databaseUrl);

  const app = await NestFactory.create(AppModule, {
    logger: false
  });

  await app.listen(0);

  return {
    app,
    baseUrl: await app.getUrl(),
    close: async () => {
      await app.close();
      await dropDatabase(databaseUrl);
    }
  } satisfies TestAppContext;
}

export type JsonResponse<T> = {
  status: number;
  body: T;
};

export async function requestJson<T>(
  baseUrl: string,
  path: string,
  init: RequestInit = {}
) {
  const response = await fetch(new URL(path, `${baseUrl}/`), {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {})
    }
  });

  const text = await response.text();
  const body = text ? (JSON.parse(text) as T) : (null as T);

  return {
    status: response.status,
    body
  } satisfies JsonResponse<T>;
}

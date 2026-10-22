import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

/** Aplica as migrations versionadas no banco dedicado de testes (imobzap_test). Os testes limpam as tabelas entre si. */
export default function setup() {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const base = process.env.DATABASE_URL ?? "postgresql://imobzap:imobzap@127.0.0.1:5432/imobzap?schema=public";
  const testUrl = process.env.TEST_DATABASE_URL ?? base.replace(/\/[^/?]+(\?|$)/, "/imobzap_test$1");
  process.env.DATABASE_URL = testUrl;
  process.env.TEST_DATABASE_URL = testUrl;
  execSync("npx prisma migrate deploy", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: testUrl },
  });
}

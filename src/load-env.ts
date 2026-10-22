// Carrega .env em desenvolvimento (Node >= 20.12 tem process.loadEnvFile nativo).
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");

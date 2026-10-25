import { ConfigurationError } from "@/lib/errors/configuration-error";

const DEVELOPMENT_JWT_SECRET = "dev-only-secret-min-32-characters-long!!";

function normalizeBaseUrl(raw: string | undefined): string | null {
  const value = raw?.trim();
  return value ? value.replace(/\/$/, "") : null;
}

/**
 * Lê `IMOBLY_<nome>`; aceita o nome antigo `SAAS_<nome>` (herdado do saas-template-web)
 * para não quebrar ambientes já configurados. Remover o fallback quando todos migrarem.
 */
function env(name: string, legacy: string): string | undefined {
  return process.env[name]?.trim() || process.env[legacy]?.trim() || undefined;
}

class AppConfig {
  get nodeEnvironment(): string {
    return process.env.NODE_ENV?.trim() || "development";
  }

  get isProduction(): boolean {
    return this.nodeEnvironment === "production";
  }

  /** URL da API do imobly (processo `src/main.ts`), usada só pelo servidor Next (BFF). */
  get saasApiBaseUrl(): string | null {
    return normalizeBaseUrl(env("IMOBLY_API_URL", "SAAS_API_BASE_URL"));
  }

  get saasApiToken(): string | null {
    return env("IMOBLY_API_TOKEN", "SAAS_API_TOKEN") || null;
  }

  get saasApiTenantId(): string | null {
    return env("IMOBLY_API_TENANT_ID", "SAAS_API_TENANT_ID") || null;
  }

  get shouldSendTenantHeader(): boolean {
    const value = env("IMOBLY_SKIP_TENANT_HEADER", "SAAS_SKIP_TENANT_HEADER")?.toLowerCase();
    return value !== "1" && value !== "true" && value !== "yes";
  }

  get jwtSecret(): string {
    const secret = process.env.JWT_SECRET?.trim();
    if (secret) return secret;
    if (!this.isProduction) return DEVELOPMENT_JWT_SECRET;

    throw new ConfigurationError("JWT_SECRET is required in production");
  }
}

export const appConfig = new AppConfig();

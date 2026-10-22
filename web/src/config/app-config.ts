import { ConfigurationError } from "@/lib/errors/configuration-error";

const DEVELOPMENT_JWT_SECRET = "dev-only-secret-min-32-characters-long!!";

function normalizeBaseUrl(raw: string | undefined): string | null {
  const value = raw?.trim();
  return value ? value.replace(/\/$/, "") : null;
}

class AppConfig {
  get nodeEnvironment(): string {
    return process.env.NODE_ENV?.trim() || "development";
  }

  get isProduction(): boolean {
    return this.nodeEnvironment === "production";
  }

  get saasApiBaseUrl(): string | null {
    return normalizeBaseUrl(process.env.SAAS_API_BASE_URL);
  }

  get saasApiToken(): string | null {
    return process.env.SAAS_API_TOKEN?.trim() || null;
  }

  get saasApiTenantId(): string | null {
    return process.env.SAAS_API_TENANT_ID?.trim() || null;
  }

  get shouldSendTenantHeader(): boolean {
    const value = process.env.SAAS_SKIP_TENANT_HEADER?.trim().toLowerCase();
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

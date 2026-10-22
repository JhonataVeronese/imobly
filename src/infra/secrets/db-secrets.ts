import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { SecretsPort } from "../../ports/infra.js";

/**
 * Cofre da POC: AES-256-GCM com chave mestra vinda do ambiente (fora do banco e do código).
 * Em produção, trocar por AWS Secrets Manager/KMS implementando a mesma SecretsPort.
 */
export class EncryptedDbSecrets implements SecretsPort {
  private readonly key: Buffer;
  constructor(
    private readonly db: PrismaClient,
    masterKeyBase64: string,
  ) {
    this.key = Buffer.from(masterKeyBase64, "base64");
    if (this.key.length !== 32) throw new Error("SECRETS_MASTER_KEY deve ter 32 bytes");
  }

  async put(tenantId: string, value: Record<string, string>): Promise<string> {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(tenantId));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
    const row = await this.db.secret.create({
      data: {
        tenantId,
        ciphertext: ciphertext.toString("base64"),
        iv: iv.toString("base64"),
        authTag: cipher.getAuthTag().toString("base64"),
      },
    });
    return row.id;
  }

  async get(tenantId: string, ref: string): Promise<Record<string, string>> {
    const row = await this.db.secret.findFirst({ where: { id: ref, tenantId } });
    if (!row) throw new Error("segredo não encontrado");
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(row.iv, "base64"));
    // tenantId como AAD: um segredo copiado para outro tenant não decifra.
    decipher.setAAD(Buffer.from(tenantId));
    decipher.setAuthTag(Buffer.from(row.authTag, "base64"));
    const plain = Buffer.concat([decipher.update(Buffer.from(row.ciphertext, "base64")), decipher.final()]);
    return JSON.parse(plain.toString("utf8")) as Record<string, string>;
  }
}

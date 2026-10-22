import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { AppConfig } from "../../config.js";
import type { StoragePort } from "../../ports/infra.js";

/** Armazenamento compatível com S3 (AWS S3, R2, MinIO, SeaweedFS...). Bucket privado + URLs assinadas. */
export class S3Storage implements StoragePort {
  private readonly client: S3Client;
  constructor(private readonly cfg: AppConfig) {
    this.client = new S3Client({
      region: cfg.S3_REGION,
      endpoint: cfg.S3_ENDPOINT || undefined,
      forcePathStyle: cfg.S3_FORCE_PATH_STYLE,
      credentials:
        cfg.S3_ACCESS_KEY && cfg.S3_SECRET_KEY
          ? { accessKeyId: cfg.S3_ACCESS_KEY, secretAccessKey: cfg.S3_SECRET_KEY }
          : undefined,
    });
  }
  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.cfg.S3_BUCKET, Key: key, Body: body, ContentType: contentType }));
  }
  async get(key: string) {
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.cfg.S3_BUCKET, Key: key }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }
  async signedUrl(key: string, ttlSeconds: number) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.cfg.S3_BUCKET, Key: key }), { expiresIn: ttlSeconds });
  }
  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.cfg.S3_BUCKET, Key: key }));
  }
}

/** Disco local (desenvolvimento). URLs assinadas por HMAC, servidas pela rota GET /files/*. */
export class LocalDiskStorage implements StoragePort {
  private readonly root: string;
  constructor(
    dir: string,
    private readonly publicBaseUrl: string,
    private readonly signingKey: string,
  ) {
    this.root = resolve(dir);
  }
  private path(key: string): string {
    const p = resolve(this.root, key);
    if (!p.startsWith(this.root + sep)) throw new Error("storage key inválida");
    return p;
  }
  async put(key: string, body: Buffer) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, body);
  }
  async get(key: string) {
    return readFile(this.path(key));
  }
  async delete(key: string) {
    await rm(this.path(key), { force: true });
  }
  async signedUrl(key: string, ttlSeconds: number) {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const sig = this.sign(key, exp);
    return `${this.publicBaseUrl}/files/${key.split("/").map(encodeURIComponent).join("/")}?exp=${exp}&sig=${sig}`;
  }
  verify(key: string, exp: number, sig: string): boolean {
    if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
    const expected = Buffer.from(this.sign(key, exp));
    const given = Buffer.from(sig);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }
  private sign(key: string, exp: number): string {
    return createHmac("sha256", this.signingKey).update(`${key}:${exp}`).digest("base64url");
  }
}

export class MemoryStorage implements StoragePort {
  readonly objects = new Map<string, { body: Buffer; contentType: string }>();
  async put(key: string, body: Buffer, contentType: string) {
    this.objects.set(key, { body, contentType });
  }
  async get(key: string) {
    const o = this.objects.get(key);
    if (!o) throw new Error(`objeto não encontrado: ${key}`);
    return o.body;
  }
  async signedUrl(key: string) {
    return `memory://${key}`;
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
}

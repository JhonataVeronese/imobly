import { createHmac, timingSafeEqual } from "node:crypto";

type Headers = Record<string, string | string[] | undefined>;

const header = (h: Headers, name: string): string | null => {
  const v = h[name.toLowerCase()];
  return (Array.isArray(v) ? v[0] : v) ?? null;
};

export type SignatureCheck = { ok: true } | { ok: false; reason: string };

/**
 * Assinatura dos webhooks da Omni Z-API (developer.omni.z-api.io/webhooks/signature):
 *   x-webhook-signature: t={unix},v1={hmac_sha256_hex}
 *   x-idempotency-key:   {topic}:{partition}:{offset}
 *   assinado: "{t}\n{topic}\n{partition}\n{offset}\n{corpo}" — corpo nos bytes exatos, já descompactado.
 * Rejeita fora da janela de `toleranceSeconds` (proteção contra replay).
 */
export function verifyOmniSignature(
  rawBody: Buffer,
  headers: Headers,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
): SignatureCheck {
  const sig = header(headers, "x-webhook-signature");
  const idem = header(headers, "x-idempotency-key");
  if (!sig || !idem) return { ok: false, reason: "missing_signature_headers" };

  const parts = Object.fromEntries(sig.split(",").map((kv) => kv.trim().split("=", 2) as [string, string]));
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1 || !/^\d+$/.test(t) || !/^[0-9a-f]+$/i.test(v1)) return { ok: false, reason: "malformed_signature" };
  if (Math.abs(nowSeconds - Number(t)) > toleranceSeconds) return { ok: false, reason: "stale_signature" };

  // rsplit(":", 2): o tópico pode conter ":".
  const m = idem.match(/^(.*):([^:]+):([^:]+)$/);
  if (!m) return { ok: false, reason: "malformed_idempotency_key" };
  const [, topic, partition, offset] = m;

  const canonical = Buffer.concat([Buffer.from(`${t}\n${topic}\n${partition}\n${offset}\n`, "utf8"), rawBody]);
  const expected = createHmac("sha256", secret).update(canonical).digest();
  const received = Buffer.from(v1, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received) ? { ok: true } : { ok: false, reason: "bad_signature" };
}

/** Gera os cabeçalhos como a Omni faria — usado nos testes. */
export function signOmniWebhook(rawBody: Buffer, secret: string, t: number, idempotencyKey = "messages:0:1") {
  const m = idempotencyKey.match(/^(.*):([^:]+):([^:]+)$/)!;
  const canonical = Buffer.concat([Buffer.from(`${t}\n${m[1]}\n${m[2]}\n${m[3]}\n`, "utf8"), rawBody]);
  return {
    "x-webhook-signature": `t=${t},v1=${createHmac("sha256", secret).update(canonical).digest("hex")}`,
    "x-idempotency-key": idempotencyKey,
  };
}

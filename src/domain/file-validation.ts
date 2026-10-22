import { DomainError } from "./errors.js";

export type AllowedMime = "application/pdf" | "image/jpeg" | "image/png";

/** Detecta o tipo REAL pelo conteúdo (magic bytes) — não confia em extensão nem em mimeType declarado. */
export function sniffMime(buf: Buffer): AllowedMime | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return "image/png";
  return null;
}

export interface FileLimits {
  maxImageBytes: number;
  maxDocumentBytes: number;
}

export interface ValidatedFile {
  mimeType: AllowedMime;
  kind: "image" | "document";
  sizeBytes: number;
}

export function validateFile(buf: Buffer, limits: FileLimits): ValidatedFile {
  if (buf.length === 0) throw new DomainError("file_empty", "Arquivo vazio ou indisponível");
  const mimeType = sniffMime(buf);
  if (!mimeType) throw new DomainError("file_type_not_allowed", "Formato não suportado (aceitos: PDF, JPEG, PNG)");
  const kind = mimeType === "application/pdf" ? "document" : "image";
  const max = kind === "image" ? limits.maxImageBytes : limits.maxDocumentBytes;
  if (buf.length > max) {
    throw new DomainError("file_too_large", `Arquivo excede o limite de ${Math.round(max / 1024 / 1024)} MB`);
  }
  if (kind === "document" && !buf.subarray(Math.max(0, buf.length - 1024)).toString("latin1").includes("%%EOF")) {
    throw new DomainError("file_corrupted", "PDF inválido ou truncado");
  }
  return { mimeType, kind, sizeBytes: buf.length };
}

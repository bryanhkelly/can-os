import { randomUUID } from "node:crypto";
import { resolveR2Config, signPrivateObjectUrl } from "@/platform/storage/r2";

const documentKeyPattern = /^enrollment\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/i;

export const r2Config = resolveR2Config;

export function newDocumentKey(applicationId: string, requirementId: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(applicationId) || !/^[0-9a-f-]{36}$/i.test(requirementId)) {
    throw new Error("Invalid document scope");
  }
  return `enrollment/${applicationId}/${requirementId}/${randomUUID()}`;
}

export function signR2Object(method: "PUT" | "HEAD" | "GET", key: string, contentType?: string, expires = 180): string {
  return signPrivateObjectUrl({ method, key, keyPattern: documentKeyPattern, contentType, expiresSeconds: expires });
}

export const allowedDocumentMime = new Set(["application/pdf", "image/jpeg", "image/png"]);

export function validateDocumentUpload(fileName: string, mimeType: string, size: number): void {
  if (fileName.length < 1 || fileName.length > 150 || /[\\/\x00-\x1f]/.test(fileName)) throw new Error("Invalid file name");
  if (!allowedDocumentMime.has(mimeType)) throw new Error("Only PDF, JPEG and PNG files are supported");
  if (!Number.isSafeInteger(size) || size < 16 || size > 10 * 1024 * 1024) throw new Error("Document size must be 16 bytes to 10 MB");
}

export async function verifyDocumentObject(key: string, mimeType: string, size: number): Promise<void> {
  const [{ verifyPrivateObject }, { matchesEnrollmentDocumentSignature }] = await Promise.all([
    import("@/platform/storage/r2"),
    import("@/domain/enrollment-document-signature"),
  ]);
  await verifyPrivateObject({
    key, keyPattern: documentKeyPattern, expectedSize: size,
    expectedContentType: mimeType, verifySignature: matchesEnrollmentDocumentSignature,
  });
}

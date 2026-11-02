import { ClientSafeError, ValidationError } from "@/domain/errors";

export interface PrivateUpload {
  objectKey: string;
  uploadUrl: string;
  uploadHeaders: Record<string, string>;
  expiresAt: string;
}

export const documentMimeTypes = ["application/pdf", "image/jpeg", "image/png"] as const;
export const photoMimeTypes = ["image/jpeg", "image/png"] as const;
export type DocumentMimeType = typeof documentMimeTypes[number];

export function validateUploadFile(
  file: { size: number },
  contentType: string,
  allowedTypes: readonly DocumentMimeType[] = documentMimeTypes,
  maxBytes = 10 * 1024 * 1024,
): asserts contentType is DocumentMimeType {
  if (!allowedTypes.some(type => type === contentType)) throw new ValidationError("Unsupported upload file type.");
  if (!Number.isSafeInteger(file.size) || file.size < 16 || file.size > maxBytes) {
    throw new ValidationError(`Upload must be between 16 bytes and ${maxBytes / (1024 * 1024)} MB.`);
  }
}

export function attachmentContentType(fileName: string): DocumentMimeType {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return "application/pdf";
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  throw new ValidationError("Unsupported file type. Use PDF, PNG or JPEG.");
}

export function assertPrivateUploadCors(
  response: Response,
  origin: string,
  requiredHeaders: readonly string[],
): void {
  if (!response.ok) throw new Error(`R2 CORS preflight failed (HTTP ${response.status}).`);

  const allowedOrigin = response.headers.get("access-control-allow-origin");
  if (allowedOrigin !== origin) {
    throw new Error("R2 CORS does not allow the configured application origin.");
  }
  const methods = new Set((response.headers.get("access-control-allow-methods") ?? "")
    .split(",").map(value => value.trim().toUpperCase()));
  if (!methods.has("PUT")) throw new Error("R2 CORS does not allow PUT uploads.");

  const allowedHeaders = new Set((response.headers.get("access-control-allow-headers") ?? "")
    .split(",").map(value => value.trim().toLowerCase()));
  const missing = requiredHeaders.filter(header => !allowedHeaders.has(header.toLowerCase()));
  if (missing.length) {
    throw new Error(`R2 CORS is missing required upload headers: ${missing.join(", ")}.`);
  }
}

/** Transport only: the owning domain must authorize begin and confirm finish. */
export async function uploadPrivateFile(file: File, upload: PrivateUpload, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new DOMException("File upload was cancelled.", "AbortError");
  const expiresAt = Date.parse(upload.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new ValidationError("The upload authorization has expired. Request a new upload before continuing.");
  }
  let response: Response;
  try {
    response = await fetch(upload.uploadUrl, {
      method: "PUT", headers: upload.uploadHeaders, body: file, credentials: "omit", signal,
    });
  } catch (cause) {
    if (signal?.aborted || (cause instanceof DOMException && cause.name === "AbortError")) {
      throw new DOMException("File upload was cancelled.", "AbortError");
    }
    throw new ClientSafeError("UNEXPECTED",
      "File upload could not reach storage. Check your connection and storage CORS configuration.",
      "File upload could not reach storage.", { cause });
  }
  if (!response.ok) {
    const code = response.status === 403 ? "FORBIDDEN" : response.status === 412 ? "CONFLICT" : "UNEXPECTED";
    const message = response.status === 403
      ? "Storage denied this upload. Check your access and try again."
      : response.status === 412
        ? "This file already exists in storage. Request a new upload before retrying."
        : `File upload failed (HTTP ${response.status}). The file has not been confirmed.`;
    throw new ClientSafeError(code, message, `R2 upload failed with HTTP ${response.status}.`);
  }
}

/** Retains a confirmed object when its domain completion command needs retrying. */
export class PrivateUploadCompletion<TUpload extends PrivateUpload> {
  private pending: { file: File; upload: TUpload } | null = null;

  get hasPendingCompletion(): boolean {
    return this.pending !== null;
  }

  async run<TResult>(
    file: File,
    begin: () => Promise<TUpload>,
    complete: (upload: TUpload) => Promise<TResult>,
    signal?: AbortSignal,
  ): Promise<TResult> {
    if (signal?.aborted) throw new DOMException("File upload was cancelled.", "AbortError");
    let upload = this.pending?.file === file ? this.pending.upload : undefined;
    if (!upload) {
      upload = await begin();
      await uploadPrivateFile(file, upload, signal);
      this.pending = { file, upload };
    }
    if (signal?.aborted) throw new DOMException("File upload was cancelled.", "AbortError");
    const result = await complete(upload);
    if (this.pending?.upload === upload) this.pending = null;
    return result;
  }
}

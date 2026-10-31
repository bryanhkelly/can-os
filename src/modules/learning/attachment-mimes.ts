/**
 * Shared allowlist for learning attachment uploads (assignment submissions and
 * attendance excuses). The client file pickers and the server-side validation
 * must agree, so both import this single source of truth.
 */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const attachmentMimeByExtension: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

/** `accept` attribute value matching the allowlist exactly. */
export const attachmentAccept = Object.keys(attachmentMimeByExtension)
  .map((extension) => `.${extension}`)
  .join(",");

export const attachmentMimeForFileName = (name: string): string | null =>
  attachmentMimeByExtension[name.split(".").pop()?.toLowerCase() ?? ""] ?? null;

export function validateAttachmentUpload(fileName: string, contentType: string, sizeBytes: number): void {
  if (fileName.length < 1 || fileName.length > 150 || /[\\/\x00-\x1f]/.test(fileName)) {
    throw new Error("Invalid file name");
  }
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!attachmentMimeByExtension[extension]) {
    throw new Error("Only verified PDF, PNG and JPEG attachments are supported");
  }
  if (attachmentMimeByExtension[extension] !== contentType) {
    throw new Error("File content type does not match its extension");
  }
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 16 || sizeBytes > MAX_ATTACHMENT_BYTES) {
    throw new Error("Attachments must be 16 bytes to 10 MB");
  }
}

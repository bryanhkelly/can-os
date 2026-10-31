import type { EvidenceMimeType, EvidenceUploadAdapter } from "./EvidenceUploader";

export type EvidenceUploadInput = {
  fileName: string; mimeType: EvidenceMimeType; size: number; expiresAt: string;
};
export type PendingEvidenceUpload<T> = { key: string; input: T };

/** Upload bytes only once. Retain the completed PUT's key if finalization fails. */
export async function submitEvidenceUpload<T extends EvidenceUploadInput>(
  adapter: EvidenceUploadAdapter<T>,
  makeInput: (file: File, expiresAt: string) => T,
  file: File | null,
  expiry: string,
  pending: PendingEvidenceUpload<T> | null,
  onBytesUploaded: (attempt: PendingEvidenceUpload<T>) => void,
): Promise<void> {
  let attempt = pending;
  if (!attempt) {
    if (!file || !expiry) throw new Error("Choose a document and its actual expiry date");
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type))
      throw new Error("Only PDF, JPEG and PNG evidence is supported");
    const input = makeInput(file, new Date(expiry + "T23:59:59.999Z").toISOString());
    const begun = await adapter.begin(input);
    const response = await fetch(begun.uploadUrl, {
      method: "PUT", headers: begun.uploadHeaders, body: file,
    });
    if (!response.ok) throw new Error("Private upload failed; evidence was not recorded");
    attempt = { key: begun.key, input };
    onBytesUploaded(attempt);
  }
  await adapter.finish({ ...attempt.input, key: attempt.key });
}

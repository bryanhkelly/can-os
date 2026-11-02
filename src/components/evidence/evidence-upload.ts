import type { EvidenceMimeType, EvidenceUploadAdapter } from "./EvidenceUploader";
import { createPrivateUploadTask, documentUploadPolicy } from "@/platform/storage/private-upload";

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
  if(pending){
    await adapter.finish({...pending.input,key:pending.key});
    return;
  }
  if (!file || !expiry) throw new Error("Choose a document and its actual expiry date");
  const input = makeInput(file, new Date(expiry + "T23:59:59.999Z").toISOString());
  await createPrivateUploadTask({
    file,policy:documentUploadPolicy,
    begin:()=>adapter.begin(input),
    onUploaded:upload=>onBytesUploaded({key:upload.key,input}),
    finish:upload=>adapter.finish({...input,key:upload.key}),
  }).run();
}

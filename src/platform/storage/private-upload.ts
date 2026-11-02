import { z } from "zod";
import { DomainError } from "@/domain/errors";

export const privateUploadSchema = z.object({
  key: z.string().min(1),
  uploadUrl: z.string().url().refine(value=>value.startsWith("https://")),
  uploadHeaders: z.record(z.string()),
  expiresInSeconds: z.number().int().positive().max(900),
});
export type PrivateUpload = z.infer<typeof privateUploadSchema>;
export type UploadPolicy = {
  contentTypes: readonly string[];
  minBytes: number;
  maxBytes: number;
};
export const documentUploadPolicy: UploadPolicy = {
  contentTypes: ["application/pdf", "image/jpeg", "image/png"],
  minBytes: 16,
  maxBytes: 10 * 1024 * 1024,
};
export const photoUploadPolicy: UploadPolicy = {
  contentTypes: ["image/jpeg", "image/png"], minBytes: 16, maxBytes: 2 * 1024 * 1024,
};

export class UploadError extends DomainError {
  constructor(public readonly uploadCode: "invalid-file" | "invalid-contract" | "cancelled" | "transport", diagnostic: string) {
    super(uploadCode === "cancelled" ? "CANCELLED" :
      uploadCode === "invalid-file" ? "VALIDATION_FAILED" : "UNAVAILABLE", diagnostic);
    this.name = "UploadError";
  }
}

export function validateUploadFile(file: File, policy: UploadPolicy, contentType = file.type): void {
  if (!file.name.trim() || !policy.contentTypes.includes(contentType)
    || (file.type !== "" && file.type !== contentType)
    || !Number.isSafeInteger(file.size) || file.size < policy.minBytes || file.size > policy.maxBytes) {
    throw new UploadError("invalid-file", "Choose a supported file within the displayed size limits.");
  }
}

/** Transport only: the domain still owns authorization, object keys and finalization. */
export async function uploadPrivateFile(file: File, contract: PrivateUpload, signal?: AbortSignal): Promise<void> {
  const parsed = privateUploadSchema.safeParse(contract);
  if (!parsed.success) throw new UploadError("invalid-contract", "Invalid private upload response.");
  const contentType = Object.entries(contract.uploadHeaders)
    .find(([name]) => name.toLowerCase() === "content-type")?.[1];
  if (!contentType || (file.type && contentType !== file.type)) throw new UploadError("invalid-contract", "Upload content type does not match the file.");
  if (signal?.aborted) throw new UploadError("cancelled", "Upload cancelled.");
  let response: Response;
  try {
    response = await fetch(contract.uploadUrl, {
      method: "PUT", headers: contract.uploadHeaders, body: file, signal,
    });
  } catch {
    throw new UploadError(signal?.aborted ? "cancelled" : "transport",
      signal?.aborted ? "Upload cancelled." : "Private upload failed. Check your connection and retry.");
  }
  if (!response.ok) throw new UploadError("transport", "Private upload failed. The file was not recorded.");
}

/** A successful PUT is retained even when finalization fails or the caller cancels afterward. */
export function createPrivateUploadTask<T extends PrivateUpload, R>(options: {
  file: File;
  policy: UploadPolicy;
  contentType?: string;
  onUploaded?: (upload: T) => void;
  begin: () => Promise<T>;
  finish: (upload: T) => Promise<R>;
}) {
  let uploaded: T | undefined;
  let result: { value: R } | undefined;
  let inFlight: Promise<R> | undefined;
  async function execute(signal?: AbortSignal): Promise<R> {
    if (result) return result.value;
    if (signal?.aborted) throw new UploadError("cancelled", "Upload cancelled.");
    if (!uploaded) {
      validateUploadFile(options.file, options.policy, options.contentType);
      const contract = await options.begin();
      await uploadPrivateFile(options.file, contract, signal);
      uploaded = contract;
      options.onUploaded?.(contract);
    }
    if (signal?.aborted) throw new UploadError("cancelled", "Upload cancelled.");
    const value = await options.finish(uploaded);
    result = { value };
    return value;
  }
  return {
    run(signal?: AbortSignal): Promise<R> {
      if (inFlight) return inFlight;
      inFlight = execute(signal).finally(() => { inFlight = undefined; });
      return inFlight;
    },
  };
}

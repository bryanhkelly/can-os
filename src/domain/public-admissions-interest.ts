import { z } from "zod";

const name = z.string().trim().min(1).max(80)
  .refine(value => !/[<>\r\n]/.test(value), "Use a plain-text contact name");

/**
 * Anonymous interest is a request for contact only. No student identity,
 * household, guardian relationship, admission or enrollment is created.
 */
export const publicAdmissionsInterestInput = z.object({
  requestId: z.string().uuid(),
  programId: z.string().uuid(),
  firstName: name,
  lastName: name,
  email: z.string().trim().toLowerCase().email().max(254),
  message: z.string().trim().max(500).default(""),
  contactConsent: z.literal("yes"),
  website: z.string().max(150).default(""), // invisible honeypot
}).strict();

export type PublicAdmissionsInterestInput = z.infer<typeof publicAdmissionsInterestInput>;

/** Bound memory BEFORE calling formData() or URLSearchParams(). */
export async function readSmallUrlEncodedBody(request: Request): Promise<URLSearchParams> {
  const type = request.headers.get("content-type") ?? "";
  if (!/^application\/x-www-form-urlencoded(?:\s*;|\s*$)/i.test(type))
    throw new Error("Use the website inquiry form");
  const max = 4096;
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > max))
    throw new Error("Inquiry too large");
  if (!request.body) throw new Error("Missing inquiry form");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > max) throw new Error("Inquiry too large");
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const buffer = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  const params = new URLSearchParams(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
  // Reject ambiguous duplicate fields instead of silently changing a
  // publisher-chosen Program or consent value.
  if (new Set(params.keys()).size !== [...params.keys()].length)
    throw new Error("Duplicate form fields");
  return params;
}

export function parsePublicAdmissionsInterest(params: URLSearchParams): PublicAdmissionsInterestInput {
  return publicAdmissionsInterestInput.parse(Object.fromEntries(params.entries()));
}

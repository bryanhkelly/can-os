import { identityEmailDomain } from "@/domain/domain-classification";
import { suppressDemoEmailDelivery } from "@/domain/email-delivery-policy";

export type ResendEmailPayload = {
  from: string;
  to: [string];
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: string; content_type?: string; content_id?: string }[];
  tags?: { name: string; value: string }[];
  headers?: Record<string,string>;
};

/** One provider boundary for access, transactional and campaign mail.
 * Callers retain authorization, consent, templates, and retry/receipt policy.
 * Do not interpret provider acceptance as final delivery. Never log payloads. */
export async function submitResendEmail(
  payload: ResendEmailPayload,
  apiKey: string,
  idempotencyKey?: string,
): Promise<Response> {
  if (payload.to.length !== 1 || suppressDemoEmailDelivery(payload.to[0]))
    throw new Error("Email destination suppressed");
  const destination=payload.to[0];
  // The provider can parse display-name syntax. Only accept a bare mailbox
  // so a malformed address cannot conceal a suppressed destination.
  if(destination!==destination.trim() || !identityEmailDomain(destination) ||
     /[\s<>,;:"()[\]\\\x00-\x1f\x7f]/.test(destination) || destination.length>254)
    throw new Error("Invalid email destination");
  if (!apiKey || !payload.from) throw new Error("Email transport not configured");
  return fetch("https://api.resend.com/emails", {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(payload),
  });
}

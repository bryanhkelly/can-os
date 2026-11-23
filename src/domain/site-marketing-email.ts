import { z } from "zod";

/** Marketing sends are deliberately distinct from family invitations and enrollment. */
export const marketingEmailScopeSchema = z.object({
  siteId: z.string().uuid(),
  packageId: z.string().uuid(),
}).strict();

export const queueMarketingEmailSchema = marketingEmailScopeSchema.extend({
  releaseId: z.string().uuid(),
  requestId: z.string().uuid(),
  mode: z.enum(["test", "campaign"]),
  recipients: z.string().max(8000).default(""),
  postalAddress: z.string().trim().min(10).max(300),
  consentConfirmed: z.boolean(),
}).strict();

export type MarketingEmailRecipient = {
  key: string;
  email: string;
  status: "queued" | "accepted" | "failed" | "suppressed";
  attempts: number;
  providerMessageId?: string;
  optedOutAt?: string;
};

export type MarketingEmailMetadata = {
  kind: "site_marketing_email_campaign";
  version: 1;
  requestId: string;
  fingerprint: string;
  packageId: string;
  releaseId: string;
  sourcePackageRevision: number;
  mode: "test" | "campaign";
  subject: string;
  postalAddress: string;
  consentBasis: "verified_sender_account" | "operator_attested_explicit_opt_in";
  recipients: MarketingEmailRecipient[];
  status: "queued" | "complete" | "needs_attention";
};

const address = z.string().trim().toLowerCase().email().max(254);

/** One email address per line. No student information, unverified lists or CSV import. */
export function parseMarketingEmailRecipients(raw: string, limit = 25): string[] {
  const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) throw new Error("Enter at least one consenting adult email address.");
  if (lines.length > limit) throw new Error("Send to at most " + limit + " contacts at a time.");
  const unique = new Set<string>();
  for (const line of lines) {
    const parsed = address.safeParse(line);
    if (!parsed.success) throw new Error("Use one valid email address per line, without names or other information.");
    unique.add(parsed.data);
  }
  return [...unique];
}

export function marketingEmailDeliverySummary(recipients: readonly MarketingEmailRecipient[]) {
  return {
    total: recipients.length,
    queued: recipients.filter(item => item.status === "queued").length,
    accepted: recipients.filter(item => item.status === "accepted").length,
    failed: recipients.filter(item => item.status === "failed").length,
    suppressed: recipients.filter(item => item.status === "suppressed").length,
  };
}

/** Unknown or malformed metadata never becomes an instruction to dispatch. */
export const marketingEmailMetadataSchema = z.object({
  kind: z.literal("site_marketing_email_campaign"),
  version: z.literal(1),
  requestId: z.string().uuid(),
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  packageId: z.string().uuid(),
  releaseId: z.string().uuid(),
  sourcePackageRevision: z.number().int().positive(),
  mode: z.enum(["test", "campaign"]),
  subject: z.string().trim().min(3).max(160),
  postalAddress: z.string().trim().min(10).max(300),
  consentBasis: z.enum(["verified_sender_account", "operator_attested_explicit_opt_in"]),
  recipients: z.array(z.object({
    key: z.string().uuid(),
    email: address,
    status: z.enum(["queued", "accepted", "failed", "suppressed"]),
    attempts: z.number().int().nonnegative(),
    providerMessageId: z.string().optional(),
    optedOutAt: z.string().datetime({ offset: true }).optional(),
  }).strict()).min(1).max(25),
  status: z.enum(["queued", "complete", "needs_attention"]),
}).strict();

export function emailOptedOutPreviously(
  email: string, batches: readonly Pick<MarketingEmailMetadata, "recipients">[],
): boolean {
  return batches.some(batch => batch.recipients.some(recipient =>
    recipient.email === email && Boolean(recipient.optedOutAt)));
}

export function formatMarketingFooter(
  postalAddress: string, unsubscribeUrl: string,
): { html: string; text: string } {
  const escape = (value: string) => value.replace(/&/g, "&amp;")
    .replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return {
    html: '<div style="margin-top:24px;padding-top:16px;border-top:1px solid #ddd;font:12px/1.6 Arial,sans-serif;color:#555">' +
      "You are receiving this message because you asked to hear from this organization.<br>" +
      escape(postalAddress) + '<br><a href="' + escape(unsubscribeUrl) + '">Unsubscribe</a></div>',
    text: "\n\nYou are receiving this message because you asked to hear from this organization." +
      "\n" + postalAddress + "\nUnsubscribe: " + unsubscribeUrl,
  };
}

export function appendMarketingFooter(html: string, footer: string): string {
  return /<\/body\s*>/i.test(html)
    ? html.replace(/<\/body\s*>/i, footer + "</body>")
    : html + footer;
}

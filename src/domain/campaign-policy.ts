export const campaignRecipientLimit = 1000;
export const campaignMaxAttempts = 4;
export const campaignRetryWindowMs = 20 * 60 * 60 * 1000;

function isInvalidCampaignRecipient(v: string): boolean {
  return v.length>254||! /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/i.test(v)||v.includes("..")||/\.(test|invalid|example|localhost)$/.test(v)||/@example\.(com|net|org)$/.test(v);
}

export function parseCampaignRecipients(raw: string) {
  const recipients = [...new Set(raw.split(/[;,\s]+/).filter(Boolean).map(value => value.toLowerCase()))];
  const invalid = recipients.filter(isInvalidCampaignRecipient);
  return { recipients, invalid, tooMany: recipients.length > campaignRecipientLimit };
}

export function campaignOwnerScope(owner: {
  ownerKind: string;
  organizationId: string | null;
  siteId: string | null;
  programId: string | null;
}) {
  const id = owner.ownerKind === "organization" ? owner.organizationId
    : owner.ownerKind === "site" ? owner.siteId
    : owner.ownerKind === "program" ? owner.programId : null;
  if (owner.ownerKind !== "platform" && !id) throw new Error("Invalid campaign owner");
  return {
    ownerScope: owner.ownerKind + ":" + (id ?? "platform"),
    senderScope: owner.organizationId ? "organization:" + owner.organizationId : "platform:platform",
  };
}

export function campaignRetryable(attempts: number, firstAttemptAt: string | Date, now = Date.now()) {
  return attempts < campaignMaxAttempts &&
    now - new Date(firstAttemptAt).getTime() < campaignRetryWindowMs;
}

/** Preserve ambiguous prior sends until authenticated provider evidence resolves them. */
export function campaignRetryAfterMs(value: string | null, now = Date.now()) {
  if (!value) return 0;
  const ms = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - now;
  return Number.isFinite(ms) ? Math.min(campaignRetryWindowMs, Math.max(0, ms)) : 0;
}

/** An HTTP rejection is not necessarily evidence that the provider did not send.
 * Rate limiting is a definite rejection of this attempt; prior ambiguity is retained by settlement. */
export function campaignProviderFailure(status: number) {
  const retryable = status === 429 || status === 408 || status === 409 || status >= 500;
  return {
    retryable,
    outcomeUnconfirmed: retryable && status !== 429,
    stopBatch: status === 429 || status >= 500,
  };
}

/** Import a single email column, optional email header, optional CSV quoting.
 * Other columns are rejected rather than guessing which field is an address. */
export function parseCampaignRecipientCsv(raw: string) {
  const lines = raw.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/).map(value => value.trim()).filter(Boolean);
  const cells = lines.map(line => {
    const quoted = /^"([^"\r\n]*)"$/.exec(line);
    if (quoted) return (quoted[1] ?? "").trim();
    if (/[,"]/.test(line)) throw new Error("Use a single email column with no other fields.");
    return line;
  });
  if (/^email(?: address)?$/i.test(cells[0] ?? "")) cells.shift();
  if (cells.some(cell => !cell || /[,;\s]/.test(cell))) throw new Error("Use one email address per row.");
  const parsed = parseCampaignRecipients(cells.join("\n"));
  if (!parsed.recipients.length || parsed.invalid.length || parsed.tooMany) {
    throw new Error("CSV must contain 1 to 1,000 valid email addresses.");
  }
  return parsed.recipients.join("\n");
}

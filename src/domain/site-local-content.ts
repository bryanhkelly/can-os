/**
 * PUB-18 local website copy belongs to the Site's church partner, not to CAN.
 * This is intentionally plain text: no raw HTML, embeds, media, student data,
 * prices, academic Program fields, or accreditation claims.
 */
export type SiteLocalContent = {
  welcomeMessage: string;
  localDescription: string;
  denomination: string;
  statementOfFaith: string;
  spiritualFormation: string;
};

export const emptySiteLocalContent: SiteLocalContent = Object.freeze({
  welcomeMessage: "",
  localDescription: "",
  denomination: "",
  statementOfFaith: "",
  spiritualFormation: "",
});

export const siteLocalContentLimits: Readonly<Record<keyof SiteLocalContent, number>> = {
  welcomeMessage: 240,
  localDescription: 1400,
  denomination: 120,
  statementOfFaith: 2600,
  spiritualFormation: 1200,
};

export type SiteLocalContentDecision =
  | { status: "published"; flaggedFields: [] }
  | { status: "review_required"; flaggedFields: (keyof SiteLocalContent)[] };

/**
 * Deterministic boundary rules are a conservative first screen, NOT a
 * guarantee that every misleading or unsafe statement can be detected.
 * Structured CAN-owned institutional fields are never editable here.
 * Theological/denominational words alone are not flagged.
 */
const protectedClaims = [
  /\bacc?redit(?:ed|ation|ing)?\b/i,
  /\b(?:school of record|credit issu(?:er|ing)|official transcript|diploma|graduation requirements)\b/i,
  /\b(?:tuition|school fees?|financial aid|scholarship guarantee|payment plan)\b/i,
  /\b(?:admissions? (?:are |is )?open|enrollment (?:is |now )?open|guaranteed (?:admission|enrollment|seat))\b/i,
  /\b(?:state[- ]licensed school|certified high school|official CAN curriculum|CAN[- ]approved)\b/i,
  /\b(?:official(?:ly)? (?:endorsed|recognized|affiliated) by (?:a |the )?denomination)\b/i,
  /\b(?:only (?:accept|admit|enroll) (?:children|students|families) who)\b/i,
];
const unsafeText = [
  /<\s*\/?\s*(?:script|iframe|style|img|a|svg|object|embed|form)\b/i,
  /\b(?:javascript|data):\s*[^\s]+/i,
  /\b(?:social security number|student medical records?|student passwords?)\b/i,
  /\b(?:kill|attack|physically harm)\s+(?:all|any)\s+(?:children|students|people|members)\b/i,
];

export function normalizeSiteLocalContent(input: SiteLocalContent): SiteLocalContent {
  const result = {} as SiteLocalContent;
  for (const field of Object.keys(siteLocalContentLimits) as (keyof SiteLocalContent)[]) {
    const raw = input[field];
    if (typeof raw !== "string") throw new Error("Invalid church website field");
    const value = raw.replace(/\r\n?/g, "\n").trim();
    if (value.length > siteLocalContentLimits[field] ||
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) {
      throw new Error("Local website text exceeds allowed length or contains control characters");
    }
    result[field] = value;
  }
  return result;
}

export function classifySiteLocalContent(content: SiteLocalContent): SiteLocalContentDecision {
  const flaggedFields: (keyof SiteLocalContent)[] = [];
  for (const field of Object.keys(siteLocalContentLimits) as (keyof SiteLocalContent)[]) {
    const text = content[field];
    if (unsafeText.some(rule => rule.test(text))) {
      throw new Error("This text cannot be published. Remove unsafe markup or sensitive information.");
    }
    if (protectedClaims.some(rule => rule.test(text))) flaggedFields.push(field);
  }
  return flaggedFields.length ? { status: "review_required", flaggedFields }
    : { status: "published", flaggedFields: [] };
}

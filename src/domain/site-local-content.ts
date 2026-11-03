import { sitePaletteIds, siteTypographyIds, type SitePaletteId, type SiteTypographyId } from "./site-theme";
/**
 * PUB-18 local website copy belongs to the Site's church partner, not to CAN.
 * CAN-owned academic, admissions, tuition and institutional facts are not
 * representable here. Branding is versioned with the copy; images are bounded,
 * metadata-free inline PNGs, never remote URLs or third-party tracking.
 */
export type SiteLocalTextContent = {
  welcomeMessage: string;
  localDescription: string;
  denomination: string;
  statementOfFaith: string;
  spiritualFormation: string;
  /** Additional church-owned story prompts; optional for existing revisions. */
  churchHistory?: string;
  communityOutreach?: string;
  schoolVision?: string;
  leadershipWelcome?: string;
  localTraditions?: string;
};

export type SiteLocalTextField = keyof SiteLocalTextContent;
export const siteLocalThemes = ["classic", "warm", "light"] as const;
export type SiteLocalTheme = typeof siteLocalThemes[number];
export const siteLocalImageConsentStates = [
  "unconfirmed", "no_identifiable_children", "guardian_consent_confirmed",
] as const;
export type SiteLocalImageConsent = typeof siteLocalImageConsentStates[number];

export type SiteLocalImage = {
  dataUrl: string;
  altText: string;
  rightsConfirmed: boolean;
  childImageConsent: SiteLocalImageConsent;
};
export type SiteLocalBranding = {
  theme: SiteLocalTheme;
  heroImage: SiteLocalImage | null;
  /** Curated, accessible local identity. Optional for historical revisions. */
  paletteId?: SitePaletteId;
  typographyId?: SiteTypographyId;
};
export type SiteLocalContent = SiteLocalTextContent & {
  branding: SiteLocalBranding;
};

export const siteLocalImageMaxBytes = 160 * 1024;
export const siteLocalImageMaxBase64Length = 4 * Math.ceil(siteLocalImageMaxBytes / 3) + 4;
export const emptySiteLocalBranding: SiteLocalBranding = Object.freeze({
  theme: "classic",
  paletteId: "signature",
  typographyId: "editorial",
  heroImage: null,
});
export const emptySiteLocalContent: SiteLocalContent = Object.freeze({
  welcomeMessage: "",
  localDescription: "",
  denomination: "",
  statementOfFaith: "",
  spiritualFormation: "",
  churchHistory: "",
  communityOutreach: "",
  schoolVision: "",
  leadershipWelcome: "",
  localTraditions: "",
  branding: emptySiteLocalBranding,
});

/**
 * Reusable fictional starter copy for explicitly synthetic school previews.
 * Never writes to the database. A Site editor must review and publish this
 * through the ordinary revisioned church-content command.
 */
export function createIllustrativeSchoolContent(schoolName: string): SiteLocalContent {
  const name = schoolName.trim().slice(0, 80) || "Our School";
  return {
    welcomeMessage: "A place to belong. A world of possibilities.",
    localDescription: `${name} is an illustrative community-rooted school where students are known, ideas are welcomed, and meaningful learning is part of everyday life. Explore this sample experience to imagine what a local partner school could become.`,
    denomination: "",
    statementOfFaith: "",
    spiritualFormation: "Our fictional school community makes room for reflection, encouragement, faith, and service. Partner-specific faith practices require local review.",
    churchHistory: "This is the sample origin story of a school imagined around a simple conviction: each young person deserves to be seen, challenged, and supported. A real church partner would replace this with its own history.",
    communityOutreach: "Student-led neighborhood projects, community conversations, and service opportunities help connect learning to life. These are illustrative concepts rather than scheduled activities.",
    schoolVision: "Curious minds. Courageous hearts. A community that sees what each student can become. We imagine an education that makes room for both academic challenge and authentic relationships.",
    leadershipWelcome: "Welcome. We hope this example helps you picture a thoughtful school community with meaningful relationships, purposeful learning, and a clear path for families.",
    localTraditions: "Imagine student exhibitions, family showcases, Friday celebrations, and community service days. These are fictional examples, not confirmed events.",
    branding: {
      theme: "classic",
      paletteId: "heritage",
      typographyId: "editorial",
      heroImage: null,
    },
  };
}

export const siteLocalContentLimits: Readonly<Record<SiteLocalTextField, number>> = {
  welcomeMessage: 240,
  localDescription: 1400,
  denomination: 120,
  statementOfFaith: 2600,
  spiritualFormation: 1200,
  churchHistory: 1600,
  communityOutreach: 1200,
  schoolVision: 1200,
  leadershipWelcome: 800,
  localTraditions: 800,
};

export type SiteLocalContentDecision =
  | { status: "published"; flaggedFields: [] }
  | { status: "review_required"; flaggedFields: SiteLocalTextField[] };

const protectedClaims = [
  /\bacc?redit(?:ed|ation|ing)?\b/i,
  /\b(?:school of record|credit issu(?:er|ing)|official transcript|diploma|graduation requirements)\b/i,
  /\b(?:tuition|school fees?|financial aid|scholarship guarantee|payment plan)\b/i,
  /\b(?:admissions? (?:are |is )?open|enrollment (?:is |now )?open|guaranteed (?:admission|enrollment|seat))\b/i,
  /\b(?:state[- ]licensed school|certified high school|official CAN curriculum|CAN[- ]approved)\b/i,
  /\b(?:official(?:ly)? (?:endorsed|recognized|affiliated) by (?:a |the )?denomination)\b/i,
  /\b(?:only (?:accept|admit|enroll) (?:children|students|families) who)\b/i,
  /\b(?:only|never|do not|won't)\s+(?:admit|accept|enroll)\b/i,
  /\b(?:school admissions policy|academic admission requirement|CAN(?: Academy| OS)?(?:'s)? official (?:faith|theology|doctrine))\b/i,
];
/** Institutional and admissions claims must use authoritative approved facts. */
export function containsProtectedInstitutionalClaim(text: string): boolean {
  return protectedClaims.some(rule => rule.test(text));
}

const unsafeText = [
  /<\s*\/?\s*(?:script|iframe|style|img|a|svg|object|embed|form)\b/i,
  /\b(?:javascript|data):\s*[^\s]+/i,
  /\b(?:social security number|student medical records?|student passwords?)\b/i,
  /\b(?:kill|attack|physically harm)\s+(?:all|any)\s+(?:children|students|people|members)\b/i,
];

function normalizeText(value: string | undefined, field: SiteLocalTextField): string {
  if (typeof value !== "string") throw new Error("Invalid church website field");
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (normalized.length > siteLocalContentLimits[field] ||
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(normalized)) {
    throw new Error("Local website text exceeds allowed length or contains control characters");
  }
  return normalized;
}

/** Accept only PNG critical chunks. This excludes EXIF/text/location metadata. */
function validateInlinePng(dataUrl: string): void {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match || match[1]!.length > siteLocalImageMaxBase64Length || match[1]!.length % 4 !== 0) {
    throw new Error("Website artwork must be a bounded PNG image");
  }
  let bytes: Uint8Array;
  try {
    const binary = atob(match[1]!);
    bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  } catch {
    throw new Error("Website artwork is not valid base64 PNG data");
  }
  if (bytes.length < 45 || bytes.length > siteLocalImageMaxBytes ||
    ![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) {
    throw new Error("Website artwork must be a PNG no larger than 160 KB");
  }
  const allowedChunks = new Set(["IHDR", "IDAT", "IEND"]);
  let offset = 8;
  let sawHeader = false;
  let sawData = false;
  let sawEnd = false;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new Error("Website artwork has an invalid PNG chunk");
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const end = offset + 12 + length;
    if (!allowedChunks.has(type) || end > bytes.length) {
      throw new Error("Website artwork contains unsupported PNG metadata");
    }
    if (type === "IHDR") {
      if (sawHeader || offset !== 8 || length !== 13) throw new Error("Website artwork has an invalid PNG header");
      const view = new DataView(bytes.buffer, bytes.byteOffset + offset + 8, 13);
      const width = view.getUint32(0);
      const height = view.getUint32(4);
      if (!width || !height || width > 2048 || height > 2048) {
        throw new Error("Website artwork dimensions must be between 1 and 2048 pixels");
      }
      sawHeader = true;
    } else if (!sawHeader || sawEnd) {
      throw new Error("Website artwork has an invalid PNG sequence");
    }
    if (type === "IDAT") sawData = true;
    if (type === "IEND") {
      if (length !== 0 || end !== bytes.length) throw new Error("Website artwork has an invalid PNG ending");
      sawEnd = true;
    }
    offset = end;
  }
  if (!sawHeader || !sawData || !sawEnd) throw new Error("Website artwork is incomplete");
}

export function normalizeSiteLocalContent(input: SiteLocalTextContent & {
  branding?: SiteLocalBranding | null;
}): SiteLocalContent {
  const result = {} as SiteLocalContent;
  for (const field of Object.keys(siteLocalContentLimits) as SiteLocalTextField[]) {
    result[field] = normalizeText(input[field] ?? "", field);
  }
  const branding = input.branding ?? emptySiteLocalBranding;
  if (!siteLocalThemes.includes(branding.theme)) throw new Error("Choose an approved website theme");
  const paletteId = branding.paletteId ?? "signature";
  const typographyId = branding.typographyId ?? "editorial";
  if (!sitePaletteIds.includes(paletteId) || !siteTypographyIds.includes(typographyId)) {
    throw new Error("Choose approved school visual identity options");
  }
  const image = branding.heroImage;
  if (image) {
    validateInlinePng(image.dataUrl);
    const altText = normalizeText(image.altText, "welcomeMessage");
    if (!altText || altText.length > 180) throw new Error("Describe the website artwork for screen readers");
    if (image.rightsConfirmed !== true) {
      throw new Error("Confirm that you have rights to publish this artwork");
    }
    if (image.childImageConsent !== "no_identifiable_children" &&
      image.childImageConsent !== "guardian_consent_confirmed") {
      throw new Error("Confirm that no identifiable children appear or that guardian consent is documented");
    }
    result.branding = {
      theme: branding.theme, paletteId, typographyId,
      heroImage: { dataUrl: image.dataUrl, altText, rightsConfirmed: true,
        childImageConsent: image.childImageConsent },
    };
  } else {
    result.branding = { theme: branding.theme, paletteId, typographyId, heroImage: null };
  }
  return result;
}

export function classifySiteLocalContent(content: SiteLocalContent): SiteLocalContentDecision {
  const flaggedFields: SiteLocalTextField[] = [];
  for (const field of Object.keys(siteLocalContentLimits) as SiteLocalTextField[]) {
    const text = content[field];
    if (unsafeText.some(rule => rule.test(text ?? ""))) {
      throw new Error("This text cannot be published. Remove unsafe markup or sensitive information.");
    }
    if (containsProtectedInstitutionalClaim(text ?? "")) flaggedFields.push(field);
  }
  return flaggedFields.length ? { status: "review_required", flaggedFields }
    : { status: "published", flaggedFields: [] };
}

import { isSiteFontId, type SiteFontId, sitePaletteIds, siteTypographyIds, siteTemplateIds, type SitePaletteId, type SiteTypographyId, type SiteTemplateId } from "./site-theme";
/**
 * PUB-18 local website copy belongs to the Site's church partner, not to CAN.
 * CAN-owned academic, admissions, tuition and institutional facts are not
 * representable here. Branding is versioned with the copy; images are bounded,
 * metadata-free inline PNGs, never remote URLs or third-party tracking.
 */
export type SiteLocalTextContent = {
  /** Editorial homepage headline, independent of the school name and intro. */
  heroHeadline?: string;
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
/** Only these editorial fields receive generic, editable starter suggestions.
 * Church history, theology, denominations, programs and activities are never fabricated. */
export const websiteStarterFieldIds = [
  "heroHeadline", "welcomeMessage", "localDescription", "schoolVision", "communityOutreach",
] as const satisfies readonly (keyof SiteLocalTextContent)[];
export type WebsiteStarterField = (typeof websiteStarterFieldIds)[number];
export type SiteEditorialBaseline = {
  version: 1;
  fields: Record<WebsiteStarterField, string>;
};


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
  /** Structural template is versioned with local branding, not Program facts. */
  templateId?: SiteTemplateId;
  heroImage: SiteLocalImage | null;
  /** Curated, accessible local identity. Optional for historical revisions. */
  paletteId?: SitePaletteId;
  typographyId?: SiteTypographyId;
  headingFontId?: SiteFontId;
  bodyFontId?: SiteFontId;
};
export type SiteLocalContent = SiteLocalTextContent & {
  branding: SiteLocalBranding;
  /** A versioned snapshot of this Site's original suggested copy, available
   * to its authorized editor for per-field reset. It is not public content. */
  editorialBaseline?: SiteEditorialBaseline;
};

export const siteLocalImageMaxBytes = 160 * 1024;
export const siteLocalImageMaxBase64Length = 4 * Math.ceil(siteLocalImageMaxBytes / 3) + 4;
export const emptySiteLocalBranding: SiteLocalBranding = Object.freeze({
  theme: "classic",
  paletteId: "signature",
  typographyId: "editorial",
  templateId: "heritage",
  heroImage: null,
});
export const emptySiteLocalContent: SiteLocalContent = Object.freeze({
  heroHeadline: "",
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

/** Polished, factual-claim-free suggested language. A Site editor must
 * review these aspirations before publication; this isn't evidence of actual
 * teaching, services, leadership commitments, or opening status. */
export function createSchoolWebsiteEditorialBaseline(schoolName: string): SiteEditorialBaseline {
  const name = schoolName.trim().slice(0, 80) || "Our School";
  return {
    version: 1,
    fields: {
      heroHeadline: "A place to belong. A future to build.",
      welcomeMessage: "Purposeful learning, meaningful relationships, and room to discover what comes next.",
      localDescription: `At ${name}, we believe young people have strengths worth discovering and potential worth developing. Our hope is to build a learning community shaped by curiosity, connection, and a shared commitment to helping students grow.`,
      schoolVision: "We envision a learning community where students are known as individuals, encouraged to think deeply, and inspired to use their gifts to serve others.",
      communityOutreach: "We hope to build meaningful connections with our neighbors, bringing families and community partners together around learning, service, and shared purpose.",
    },
  };
}

/** Starts real school sites with useful editable copy, not blank fields.
 * No save, publication or approval occurs until the editor acts. */
export function createSchoolWebsiteStarterContent(schoolName: string): SiteLocalContent {
  const editorialBaseline = createSchoolWebsiteEditorialBaseline(schoolName);
  return {
    ...emptySiteLocalContent,
    ...editorialBaseline.fields,
    branding: { ...emptySiteLocalBranding, paletteId: "heritage" },
    editorialBaseline,
  };
}

/** Demo sites use the same high-quality starter rather than fictional program
 * or church-history claims in the text fields. A separate global sample marker
 * remains visible in private previews. */
export function createIllustrativeSchoolContent(schoolName: string): SiteLocalContent {
  return createSchoolWebsiteStarterContent(schoolName);
}

/** Reset precisely one suggested editorial answer. Previously authored,
 * verified and non-starter fields are never erased by this action. */
export function restoreOriginalWebsiteField(
  content: SiteLocalContent, field: SiteLocalTextField,
): SiteLocalContent {
  const original = content.editorialBaseline?.fields[field as WebsiteStarterField];
  if (typeof original !== "string" || (content[field] ?? "") === original) return content;
  return { ...content, [field]: original };
}

/** Opening a historic site never rewrites its published or draft copy. The
 * missing baseline is attached to the editing snapshot only and becomes durable
 * with the next Site-scoped versioned save. */
export function prepareWebsiteEditorContent(
  existing: SiteLocalContent | null,
  schoolName: string,
): SiteLocalContent {
  if (!existing) return createSchoolWebsiteStarterContent(schoolName);
  if (existing.editorialBaseline) return existing;
  // A pre-Studio school's original is the content already saved by its editor,
  // not a newly introduced template suggestion. Never silently replace it.
  // Historic protected claims are not copied into reset metadata.
  const suggested = createSchoolWebsiteEditorialBaseline(schoolName);
  const fields = { ...suggested.fields };
  for (const key of websiteStarterFieldIds) {
    const authored = existing[key] ?? "";
    if (!containsProtectedInstitutionalClaim(authored) &&
        !unsafeText.some(rule => rule.test(authored))) fields[key] = authored;
  }
  return { ...existing, editorialBaseline: { version: 1, fields } };
}

export const siteLocalContentLimits: Readonly<Record<SiteLocalTextField, number>> = {
  heroHeadline: 120,
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
  editorialBaseline?: SiteEditorialBaseline;
}): SiteLocalContent {
  const result = {} as SiteLocalContent;
  for (const field of Object.keys(siteLocalContentLimits) as SiteLocalTextField[]) {
    result[field] = normalizeText(input[field] ?? "", field);
  }
  const branding = input.branding ?? emptySiteLocalBranding;
  if (!siteLocalThemes.includes(branding.theme)) throw new Error("Choose an approved website theme");
  const paletteId = branding.paletteId ?? "signature";
  const typographyId = branding.typographyId ?? "editorial";
  const templateId = branding.templateId ?? "heritage";
  if (!sitePaletteIds.includes(paletteId) || !siteTypographyIds.includes(typographyId) || !siteTemplateIds.includes(templateId)) {
    throw new Error("Choose approved school visual identity options");
  }
  if ((branding.headingFontId !== undefined && !isSiteFontId(branding.headingFontId)) ||
      (branding.bodyFontId !== undefined && !isSiteFontId(branding.bodyFontId))) throw new Error("Choose approved school fonts");
  const fontOverrides = { ...(branding.headingFontId ? {headingFontId:branding.headingFontId} : {}), ...(branding.bodyFontId ? {bodyFontId:branding.bodyFontId} : {}) };
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
      theme: branding.theme, paletteId, typographyId, templateId, ...fontOverrides,
      heroImage: { dataUrl: image.dataUrl, altText, rightsConfirmed: true,
        childImageConsent: image.childImageConsent },
    };
  } else {
    result.branding = { theme: branding.theme, paletteId, typographyId, templateId, ...fontOverrides, heroImage: null };
  }
  if (input.editorialBaseline) {
    const baseline = input.editorialBaseline;
    if (baseline.version !== 1 || !baseline.fields || typeof baseline.fields !== "object" ||
        Object.keys(baseline.fields).length !== websiteStarterFieldIds.length ||
        Object.keys(baseline.fields).some(key => !websiteStarterFieldIds.includes(key as WebsiteStarterField))) {
      throw new Error("Website starter snapshot is invalid");
    }
    const fields = {} as Record<WebsiteStarterField, string>;
    for (const field of websiteStarterFieldIds) {
      const value = normalizeText(baseline.fields[field], field);
      if (unsafeText.some(rule => rule.test(value)) || containsProtectedInstitutionalClaim(value)) {
        throw new Error("Website starter snapshot must not include unsafe or protected claims");
      }
      fields[field] = value;
    }
    result.editorialBaseline = { version: 1, fields };
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

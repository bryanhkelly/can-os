import { siteBrandDirectionIds, type SiteBrandDirectionId } from "./site-brand-direction";
import type { SiteExperienceProfile } from "./site-website-experience";
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

/** Missing publication requirements do not prevent a private, unfinished draft. */
export function siteLocalImagePublicationGaps(image: SiteLocalImage | null): string[] {
  if (!image) return [];
  const gaps: string[] = [];
  if (!image.altText.trim()) gaps.push("Describe the website artwork for screen readers");
  if (!image.rightsConfirmed) gaps.push("Confirm that you have rights to publish this artwork");
  if (image.childImageConsent === "unconfirmed")
    gaps.push("Confirm child-image privacy or documented guardian consent");
  return gaps;
}
export type SiteLocalBranding = {
  theme: SiteLocalTheme;
  /** Versioned with the existing Site website draft, never an unversioned sidecar. */
  brandDirectionId?: SiteBrandDirectionId;
  /** Structural template is versioned with local branding, not Program facts. */
  templateId?: SiteTemplateId;
  heroImage: SiteLocalImage | null;
  logoImage?: SiteLocalImage | null;
  /** Curated, accessible local identity. Optional for historical revisions. */
  paletteId?: SitePaletteId;
  typographyId?: SiteTypographyId;
  headingFontId?: SiteFontId;
  bodyFontId?: SiteFontId;
};
export type SiteLeader = {
  id:string;name:string;title:string;biography:string;
  linkedinUrl?:string;photo?:SiteLocalImage|null;
  /** The person or their authorized representative approved publication. */
  consentConfirmed:boolean;
};
export type WebsiteContentReuseConsent = "unselected" | "granted" | "denied";

export type SiteLocalContent = SiteLocalTextContent & {
  /** Site-scoped authorization to derive website and marketing copy from Shape data. */
  contentReuseConsent?: WebsiteContentReuseConsent;
  branding: SiteLocalBranding;
  /** Site-owned, optional Leadership page content; never auto-scraped. */
  leadershipMembers?:SiteLeader[];
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
  contentReuseConsent: "unselected",
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
  leadershipMembers: [],
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

/** Suggested text follows the saved Site plan, not a hard-coded K-12 identity.
 * Nothing here asserts an adopted Solution, enrollment, licensing or operations. */
export function createSiteWebsiteEditorialBaseline(
  siteName: string, profile: SiteExperienceProfile = "school",
): SiteEditorialBaseline {
  if (profile === "school") return createSchoolWebsiteEditorialBaseline(siteName);
  const name = siteName.trim().slice(0, 80) || "Our learning community";
  const examples: Record<Exclude<SiteExperienceProfile, "school">, {
    headline: string; welcome: string; description: string; vision: string; outreach: string;
  }> = {
    community: {
      headline: "A place to learn and belong.",
      welcome: "Explore possibilities for learning, enrichment and meaningful community connection.",
      description: "We are building a community centered on learning, shared interests and connection.",
      vision: "We envision a welcoming place where people can explore interests, discover opportunities and connect with neighbors.",
      outreach: "We hope to grow community partnerships that encourage learning, service and belonging.",
    },
    training: {
      headline: "Keep learning. Keep moving forward.",
      welcome: "Discover possibilities for adult learning, practical skills and enrichment.",
      description: "Our vision is to make adult learning more accessible, welcoming and relevant to everyday life.",
      vision: "We hope adults can explore new skills, pursue interests and continue growing at every stage of life.",
      outreach: "We hope to connect adults with local partners and opportunities for learning and development.",
    },
    "older-adult": {
      headline: "Learning and connection at every age.",
      welcome: "Explore lifelong learning, shared interests and new connections for older adults.",
      description: "Our vision is a welcoming place for older adults to stay curious, build connections and share experiences.",
      vision: "We hope older adults find meaningful opportunities to learn, connect and contribute.",
      outreach: "We hope to build local relationships that support connection, enrichment and belonging for older adults.",
    },
    lifelong: {
      headline: "Learn, connect and grow together.",
      welcome: "Explore learning and community experiences for adults and older adults.",
      description: "Our vision brings adults and older adults together around learning, curiosity and community connection.",
      vision: "We hope people at different stages of adult life find opportunities to explore, grow and connect.",
      outreach: "We hope to connect adult learners, older neighbors and community partners through shared interests.",
    },
    mixed: {
      headline: "Learning for every stage of life.",
      welcome: "Explore possibilities for learners of different ages, interests and experiences.",
      description: "Our vision brings people across generations together around learning and connection.",
      vision: "We hope learners of different ages find meaningful paths to curiosity, skills and community.",
      outreach: "We hope to connect learners, families and neighbors through meaningful partnerships.",
    },
  };
  const example = examples[profile];
  return {
    version: 1,
    fields: {
      heroHeadline: example.headline,
      welcomeMessage: example.welcome,
      localDescription: `At ${name}, ${example.description.charAt(0).toLowerCase() + example.description.slice(1)}`,
      schoolVision: example.vision,
      communityOutreach: example.outreach,
    },
  };
}

/** Only text that still exactly matches its original suggested baseline is
 * eligible for a Program-based refresh. Keep all other authored content,
 * snapshots, Brand versions and the immutable original baseline untouched. */
export function refreshSiteWebsiteSuggestedCopy(
  content: SiteLocalContent, siteName: string, profile: SiteExperienceProfile,
): SiteLocalContent {
  const original = content.editorialBaseline?.fields;
  if (!original || content.contentReuseConsent !== "granted") return content;
  const suggestions = createSiteWebsiteEditorialBaseline(siteName, profile).fields;
  let changed = false;
  const updated = { ...content };
  for (const field of websiteStarterFieldIds) {
    if (content[field] === original[field] && content[field] !== suggestions[field]) {
      updated[field] = suggestions[field];
      changed = true;
    }
  }
  return changed ? updated : content;
}

/** Starts real school sites with useful editable copy, not blank fields.
 * No save, publication or approval occurs until the editor acts. */

/** Canonical database shape for website copy and structural layout.
 * Identity colors, typography, logo and hero imagery are NOT serialized
 * into site_local_content_versions; only Site Brand versions own them.
 * This projection is for storage, not public rendering.
 */
export function websiteCopyOnlyForStorage(content:SiteLocalContent):SiteLocalContent {
  return {...content, branding:{
    theme:"classic", templateId:content.branding.templateId??"heritage",
    heroImage:null,
  }};
}

export function createSiteWebsiteStarterContent(
  schoolName: string, profile: SiteExperienceProfile = "school",
): SiteLocalContent {
  const editorialBaseline = createSiteWebsiteEditorialBaseline(schoolName, profile);
  return {
    ...emptySiteLocalContent,
    ...editorialBaseline.fields,
    branding: { ...emptySiteLocalBranding, paletteId: "heritage" },
    editorialBaseline,
  };
}

/** Legacy school callers retain the same behavior. */
export function createSchoolWebsiteStarterContent(schoolName: string): SiteLocalContent {
  return createSiteWebsiteStarterContent(schoolName, "school");
}

/** Demo sites use the same reviewed starter rather than fictional school facts. */
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
  profile: SiteExperienceProfile = "school",
): SiteLocalContent {
  if (!existing) return createSiteWebsiteStarterContent(schoolName, profile);
  if (existing.editorialBaseline) return existing;
  // A pre-Studio school's original is the content already saved by its editor,
  // not a newly introduced template suggestion. Never silently replace it.
  // Historic protected claims are not copied into reset metadata.
  const suggested = createSiteWebsiteEditorialBaseline(schoolName, profile);
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
export function validateInlinePng(dataUrl: string): void {
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
  contentReuseConsent?: WebsiteContentReuseConsent;
  leadershipMembers?: SiteLeader[];
  branding?: SiteLocalBranding | null;
  editorialBaseline?: SiteEditorialBaseline;
}, options: { allowIncompleteImage?: boolean } = {}): SiteLocalContent {
  const result = {} as SiteLocalContent;
  if(input.contentReuseConsent !== undefined && !["unselected", "granted", "denied"].includes(input.contentReuseConsent))
    throw new Error("Choose a valid website content reuse decision");
  result.contentReuseConsent = input.contentReuseConsent ?? "unselected";
  for (const field of Object.keys(siteLocalContentLimits) as SiteLocalTextField[]) {
    result[field] = normalizeText(input[field] ?? "", field);
  }
  const branding = input.branding ?? emptySiteLocalBranding;
  if (!siteLocalThemes.includes(branding.theme)) throw new Error("Choose an approved website theme");
  if (branding.brandDirectionId !== undefined && !siteBrandDirectionIds.includes(branding.brandDirectionId))
    throw new Error("Choose an approved Site brand direction");
  const paletteId = branding.paletteId ?? "signature";
  const typographyId = branding.typographyId ?? "editorial";
  const templateId = branding.templateId ?? "heritage";
  if (!sitePaletteIds.includes(paletteId) || !siteTypographyIds.includes(typographyId) || !siteTemplateIds.includes(templateId)) {
    throw new Error("Choose approved school visual identity options");
  }
  if ((branding.headingFontId !== undefined && !isSiteFontId(branding.headingFontId)) ||
      (branding.bodyFontId !== undefined && !isSiteFontId(branding.bodyFontId))) throw new Error("Choose approved school fonts");
  const fontOverrides = { ...(branding.headingFontId ? {headingFontId:branding.headingFontId} : {}), ...(branding.bodyFontId ? {bodyFontId:branding.bodyFontId} : {}) };
  const normalizeArtwork = (image: SiteLocalImage | null | undefined): SiteLocalImage | null => {
    if (!image) return null;
    validateInlinePng(image.dataUrl);
    const altText = normalizeText(image.altText, "welcomeMessage");
    if (altText.length > 180) throw new Error("Describe the website artwork in 180 characters or fewer");
    if (typeof image.rightsConfirmed !== "boolean" ||
        !siteLocalImageConsentStates.includes(image.childImageConsent)) {
      throw new Error("Choose valid artwork permissions and child-image consent");
    }
    const validatedImage = { dataUrl: image.dataUrl, altText,
      rightsConfirmed: image.rightsConfirmed, childImageConsent: image.childImageConsent };
    const gaps = siteLocalImagePublicationGaps(validatedImage);
    if (!options.allowIncompleteImage && gaps.length) throw new Error(gaps[0]);
    return validatedImage;
  };
  result.branding = { theme: branding.theme, paletteId, typographyId, templateId,
    ...(branding.brandDirectionId ? {brandDirectionId:branding.brandDirectionId} : {}), ...fontOverrides,
    heroImage: normalizeArtwork(branding.heroImage),
    ...(branding.logoImage !== undefined ? { logoImage: normalizeArtwork(branding.logoImage) } : {}),
  };
  if (input.leadershipMembers !== undefined) {
    if (!Array.isArray(input.leadershipMembers) || input.leadershipMembers.length > 16)
      throw new Error("A Site may have up to 16 leadership profiles");
    const ids=new Set<string>();
    result.leadershipMembers=input.leadershipMembers.map(member=>{
      if (!member || typeof member !== "object" ||
        typeof member.id !== "string" ||
        !/^[a-zA-Z0-9-]{8,64}$/.test(member.id) || ids.has(member.id))
        throw new Error("Each leadership entry needs a distinct ID");
      ids.add(member.id);
      const text=(value:unknown,max:number)=>{
        if(typeof value!=="string")throw new Error("Leadership text must be provided");
        const normalized=value.replace(/\r\n?/g,"\n").trim();
        if(normalized.length>max || /[<>\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(normalized))
          throw new Error("Leadership content contains invalid characters");
        return normalized;
      };
      const name=text(member.name,120);
      const title=text(member.title,120);
      const biography=text(member.biography,1600);
      if(!name || !title)throw new Error("Leadership name and title are required");
      if(typeof member.consentConfirmed!=="boolean")
        throw new Error("Confirm whether this person's profile may be published");
      const linkedinUrl=member.linkedinUrl?text(member.linkedinUrl,240):"";
      if(linkedinUrl&&!/^https:\/\/(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9_-]{3,100}\/?$/.test(linkedinUrl))
        throw new Error("Use a LinkedIn personal profile URL without tracking parameters");
      return {
        id:member.id,name,title,biography,consentConfirmed:member.consentConfirmed,
        ...(linkedinUrl?{linkedinUrl}:{}),
        ...(member.photo!==undefined?{photo:normalizeArtwork(member.photo)}:{}),
      };
    });
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

/** Private previews show drafted words but never publish unchecked artwork,
 * including portraits attached to a not-yet-approved Leadership profile. */
export function safeSiteWebsitePreviewContent(content:SiteLocalContent):SiteLocalContent {
  const safe=(photo:SiteLocalImage|null|undefined)=>
    photo&&!siteLocalImagePublicationGaps(photo).length?photo:null;
  return {
    ...content,branding:{
      ...content.branding,
      heroImage:safe(content.branding.heroImage),
      ...(content.branding.logoImage!==undefined
        ?{logoImage:safe(content.branding.logoImage)}:{}),
    },
    ...(content.leadershipMembers?{leadershipMembers:content.leadershipMembers.map(person=>({
      ...person,photo:safe(person.photo),
    }))}:{}),
  };
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
  // An authenticated editor may save a leadership draft without permission
  // to display the person's profile. Only confirmed entries are projected.
  for(const member of content.leadershipMembers??[]){
    for(const field of [member.name,member.title,member.biography]){
      if(unsafeText.some(rule=>rule.test(field)))
        throw new Error("Leadership content cannot contain unsafe text");
      if(containsProtectedInstitutionalClaim(field))
        throw new Error("Leadership biographies cannot assert unverified institutional claims");
    }
  }
  return flaggedFields.length ? { status: "review_required", flaggedFields }
    : { status: "published", flaggedFields: [] };
}

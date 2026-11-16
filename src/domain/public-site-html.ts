import { resolveSiteTheme, resolveSiteTemplateId, type SiteTemplateId } from "./site-theme";
import type { SiteContentBlockProjection } from "./site-content-channels";
import type { SiteEnrollmentOpportunity } from "./site-enrollment-opportunities";
import { projectSiteEnrollmentOpportunities, enrollmentOpportunityKinds } from "./site-enrollment-opportunities";
import { resolveSiteExperienceProfile, siteExperienceCopy } from "./site-website-experience";
import type { SiteNoncreditListing } from "./site-noncredit-public";
import { composePublicSiteChrome, composePublicSiteHero, composePublicSiteInterior, composePublicSiteHome, publicSiteTemplateCss, sevenSchoolCss } from "./public-site-templates";
import { schoolBrandMonogram } from "./school-brand-identity";
import { templateDefaultImage, templateSampleImage } from "./template-sample-images";
import { templateResponsiveAttributes,templateHeroPictureSources } from "./template-photo-responsive";
import { isPublicSiteSlug } from "./public-site-address";
import { type PublicSitePath } from "./public-site-paths";
import type { PublicParentSchoolProfile } from "./parent-information";
import type { PublicAcademicProgram } from "./academic-program-publication";
import type { PublicSiteProjection } from "./public-operation-projection";
import type {PublicSchoolSiteMedia} from "./school-site-media-public";
import { createIllustrativeSchoolContent, normalizeSiteLocalContent, type SiteLocalContent } from "./site-local-content";

/** Standalone, escaped HTML. No hydration, external scripts or CAN OS shell. */
type PublicOffering = ReturnType<typeof import("./public-site-catalog").toPublicSiteEnrichment>;
export type PublicSitePage = {
  host: string;
  site: { name: string; organizationName: string };
  /** Server-derived from the canonical synthetic Site marker, never a browser claim. */
  demonstration?: boolean;
  /** Published-page-only status derived from active Program and legal evidence. */
  operatingStatus?: "authorized" | "development" | "review_required";
  offerings: PublicOffering[];
  academicPrograms?: PublicAcademicProgram[];
  /** Only institutionally reviewed claims with public display permission are rendered. */
  parentInformation?: PublicParentSchoolProfile;
  /** Locally authored church copy, separately versioned and safety screened. */
  localContent?: SiteLocalContent | null;
  /** Site-scoped, rights-reviewed media, selected automatically by the shared engine. */
  media?: PublicSchoolSiteMedia;
  /** Explicitly eligible canonical noncredit enrollment releases from reviewed Site identity link. */
  noncreditReleases?: readonly SiteNoncreditListing[];
  enrollmentAppOrigin?: string | null;
  /** Site-owned, source-resolved website content channels. */
  contentBlocks?: readonly SiteContentBlockProjection[];
  /** Already approved, read-only discovery; never a second enrollment ledger. */
  enrollmentOpportunities?: readonly SiteEnrollmentOpportunity[];
};

/** Non-persisted, clearly fictional starter copy for read-only synthetic previews only. */
export function withIllustrativeLocalPreview(page: PublicSitePage): PublicSitePage {
  if (!page.demonstration || page.localContent) return page;
  const sample = createIllustrativeSchoolContent(page.site.name);
  // Valor is an explicitly fictional, existing reference-school fixture. This
  // variant exists only for local/private previews; it is neither a CMS write
  // nor a substitute for approved institution-owned program information.
  const isValor = page.host === "valorschool.can-os.com" &&
    page.site.name === "Valor School";
  return {...page, localContent: isValor ? {...sample,
    heroHeadline:"Be seen. Think boldly. Build what comes next.",
    welcomeMessage:"A place where big ideas meet personal attention—and students discover the confidence to make their mark.",
    localDescription:"At Valor School, ambition has a human scale. Students are encouraged to challenge assumptions, explore meaningful questions, and turn knowledge into action. Thoughtful academic instruction meets a connected community where every voice has room to be heard and every new interest has room to grow.",
    schoolVision:"We believe education should develop curious minds, courageous character, and the ability to make a positive difference. Our vision is a school where intellectual challenge and genuine belonging strengthen one another.",
    churchHistory:"Valor grew from a simple conviction: young people deserve an education that takes their ideas seriously and sees their potential beyond a test score. That vision shaped a learning community built around rigorous questions, meaningful relationships, and discovery that reaches beyond the classroom.",
    communityOutreach:"Learning becomes more powerful when it connects to real people and real places. From neighborhood research and creative problem-solving to service projects and collaborative design, students connect classroom ideas with the communities around them.",
    localTraditions:"Student exhibitions turn ambitious projects into shared celebrations. Design showcases, arts gatherings, community service days, and school-wide reflections give students opportunities to lead, contribute, and recognize one another's growth.",
  } : sample};
}

/** A published synthetic school is a demonstration, never an indexed institution. */
export function isIndexablePublicSite(page: PublicSitePage): boolean {
  return page.demonstration !== true;
}

/** Optional Agent A approved, Program-scoped public calendar contract.
 * Keep B compatible with main until Integration I merges A's authoritative DTO. */
type ApprovedProgramSchedule = {
  programId: string;
  name: {canDisplay:boolean;value:string|null};
  grades: {canDisplay:boolean;value:{min:string;max:string}|null};
  timezone: {canDisplay:boolean;value:string|null};
  effectiveFrom: {canDisplay:boolean;value:string|null};
  effectiveThrough: {canDisplay:boolean;value:string|null};
  weeklyPattern: {canDisplay:boolean;value:readonly {
    dayOfWeek:number;startsAtLocal:string;endsAtLocal:string;timezone:string;
  }[]|null};
};

export function escapePublicHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}


/** A Site-owned block inherits the selected template's typography and surfaces.
 * The editor configures presentation, while authoritative sources supply items. */
function renderSiteContentChannelBlock(block: SiteContentBlockProjection): string {
  const heading = '<div class="program-overview-heading"><div><p class="tag">' +
    escapePublicHtml(block.eyebrow) + '</p><h2>' + escapePublicHtml(block.title) +
    '</h2></div><p>' + escapePublicHtml(block.description) + '</p></div>';
  const items = block.items.map(item => {
    const label = '<p class="tag">' + escapePublicHtml(item.label) + '</p>';
    const title = '<h3>' + escapePublicHtml(item.title) + '</h3>';
    const detail = '<p>' + escapePublicHtml(item.description) + '</p>';
    // No URLs can be entered in Site block settings. Navigation comes solely
    // from verified public catalog adapters; all values are escaped.
    const safeHref = item.link?.href && (
      ["/academics","/admissions","/student-life","/programs","/courses","/classes"]
        .includes(item.link.href) ||
      /^https:\/\/[a-zA-Z0-9.-]+\/learn\/enroll\?release=[a-f0-9-]+$/i.test(item.link.href) ||
      /^https:\/\/[a-zA-Z0-9.-]+\/learn\/classes\?search=[A-Za-z0-9%+._~-]+$/i.test(item.link.href)
    );
    const action = safeHref ?
      '<a class="text-action site-channel-action" href="' +
      escapePublicHtml(item.link!.href) + '">' +
      escapePublicHtml(item.link!.label) + ' →</a>' : '';
    return '<article class="card site-channel-card">' + label + title + detail + action + '</article>';
  }).join('');
  return '<section class="site-content-block program-overview editorial-section site-channel-' +
    escapePublicHtml(block.layout) + '" data-content-channel="' + escapePublicHtml(block.channel) +
    '" aria-label="' + escapePublicHtml(block.title) + '">' +
    heading + '<div class="grid site-channel-grid">' + items + '</div></section>';
}

export function renderPublicSiteClaimsHtml(page: PublicSiteProjection): string {
  const claims = page.claims.map((claim) =>
    `<li><h2>${escapePublicHtml(claim.displayText)}</h2>` +
    `<p>Public status: ${escapePublicHtml(claim.kind)}.</p></li>`,
  ).join("");
  return `<!doctype html><html lang="en"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapePublicHtml(page.siteName)}</title>
    <style>body{font-family:system-ui,sans-serif;max-width:48rem;margin:3rem auto;padding:0 1rem;line-height:1.6}li{margin:1rem 0}h2{font-size:1.2rem}</style>
    </head><body><main><h1>${escapePublicHtml(page.siteName)}</h1>
    <h2>Public program claims</h2>
    ${claims ? `<ul>${claims}</ul>` : "<p>No program claims are currently published.</p>"}
    </main></body></html>`;
}

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
    .format(cents / 100);
}

/** Navigation is derived from available approved facts; missing sections are never linked. */
export function availablePublicSitePaths(page: PublicSitePage): PublicSitePath[] {
  const local = page.localContent;
  const hasStory = Boolean(local && [local.localDescription, local.churchHistory, local.communityOutreach,
    local.schoolVision, local.leadershipWelcome, local.localTraditions, local.denomination,
    local.statementOfFaith, local.spiritualFormation, local.branding?.heroImage].some(Boolean));
  const hasReviewedPeople = Boolean(page.parentInformation?.people.length);
  const academic = Boolean(page.academicPrograms?.length);
  const opportunities=page.enrollmentOpportunities??projectSiteEnrollmentOpportunities({
    academicPrograms:page.academicPrograms,enrichment:page.offerings,
    noncredit:page.noncreditReleases,enrollmentOrigin:page.enrollmentAppOrigin,
  });
  const kinds=enrollmentOpportunityKinds(opportunities);
  const contentOn=(path:string)=>Boolean(page.contentBlocks?.some(block=>
    block.page===path && block.items.length>0));
  const parent = page.parentInformation;
  const tuition = Boolean(academic || (parent?.tuition.description.canDisplay && parent.tuition.description.value) ||
    (parent?.tuition.financialAid.canDisplay && parent.tuition.financialAid.value));
  const services = Boolean(parent?.services.some(service => service.description.canDisplay && service.description.value));
  const faq = Boolean(academic || tuition ||
    (parent?.admissions.description.canDisplay && parent.admissions.description.value));
  const contact = Boolean((parent?.site.contact.canDisplay && parent.site.contact.value?.trim()) ||
    (parent?.site.address.canDisplay && parent.site.address.value?.trim()) || academic);
  if (page.demonstration && hasStory) {
    // Full fictional prospectus; these additional routes never grant real
    // admissions, pricing, schedule or program authority.
    return ["/", "/about", "/academics", "/student-life", "/school-day",
      "/admissions", "/tuition", "/families", "/faq", "/contact",
      "/programs", "/courses", "/classes"];
  }
  const educational=[
    ...(academic?["/academics","/school-day","/admissions"] as const:[]),
    ...(kinds.program||contentOn("/programs")?["/programs"] as const:[]),
    ...(kinds.course||contentOn("/courses")?["/courses"] as const:[]),
    ...(kinds.class||contentOn("/classes")?["/classes"] as const:[]),
    ...(page.offerings.length||kinds.program||contentOn("/student-life")?["/student-life"] as const:[]),
  ];
  const extra=[
    ...(tuition?["/tuition"] as const:[]),
    ...(services?["/families"] as const:[]),
    ...(faq?["/faq"] as const:[]),...(contact?["/contact"] as const:[]),
  ];
  const profile=resolveSiteExperienceProfile(opportunities);
  return profile==="school" || profile==="mixed"
    ? ["/",...(hasStory||hasReviewedPeople?["/about"] as const:[]),...educational,...extra]
    : ["/",...educational,...(hasStory||hasReviewedPeople?["/about"] as const:[]),...extra];
}

export function renderPublicSiteHtml(page: PublicSitePage, options?: {
  /** Caller supplies one server-generated random request ID per form. */
  makeRequestId?: () => string;
  /** Only the isolated fictional template gallery sets this; never persisted as school media. */
  templateGallery?: boolean;
  /** Explicit fictional-school template presentation, used only in read-only demo previews. */
  sampleTemplate?: SiteTemplateId;
  path?: PublicSitePath;
  localPreview?: boolean;
  /** Trusted server-resolved Site slug for local-only multipage preview. */
  localPreviewSlug?: string;
  /** Local forms are enabled only by a database-attested development server. */
  localPreviewSubmissionsEnabled?: boolean;
}): string {
  const path = options?.path ?? "/";
  const availablePaths = availablePublicSitePaths(page);
  const opportunities=page.enrollmentOpportunities??projectSiteEnrollmentOpportunities({
    academicPrograms:page.academicPrograms,enrichment:page.offerings,
    noncredit:page.noncreditReleases,enrollmentOrigin:page.enrollmentAppOrigin,
  });
  const profile=resolveSiteExperienceProfile(opportunities);
  const experienceCopy=siteExperienceCopy[profile];
  if (!availablePaths.includes(path)) throw new Error("This public page is not available");
  const school = escapePublicHtml(page.site.name);
  const org = escapePublicHtml(page.site.organizationName);
  const host = escapePublicHtml(page.host);
  const previewSlug = options?.localPreview && options.localPreviewSlug &&
    isPublicSiteSlug(options.localPreviewSlug) ? options.localPreviewSlug : null;
  const demo = page.demonstration === true;
  // A fictional school can demonstrate an admissions journey, but cannot submit
  // real inquiries, applications, or enrollment requests.
  const submissionsEnabled = !demo && (!options?.localPreview ||
    (Boolean(previewSlug) && options.localPreviewSubmissionsEnabled === true));
  const inquiryAction = previewSlug
    ? `/published-site/inquiry?site=${encodeURIComponent(previewSlug)}`
    : "/inquiry";
  const familyStartAction = previewSlug
    ? `/published-site/family-start?site=${encodeURIComponent(previewSlug)}`
    : "/apply";
  const local = page.localContent ? normalizeSiteLocalContent(page.localContent) : null;
  const theme = local?.branding.theme ?? "classic";
  const sampleTemplate = options?.localPreview && page.demonstration ? options.sampleTemplate : undefined;
  const templateId = resolveSiteTemplateId(sampleTemplate ?? local?.branding.templateId);
  const visual = resolveSiteTheme(local?.branding.paletteId, local?.branding.typographyId, local?.branding.headingFontId, local?.branding.bodyFontId, templateId);
  const displayFont = visual.displayFont;
  const visualCss = `--site-ink:${visual.ink};--site-paper:${visual.canvas};--site-accent:${visual.accent};--site-secondary:${visual.secondary};--site-muted:${visual.muted};--site-display:${displayFont};--site-body:${visual.bodyFont};`;
  const localItems = local ? [
    ["Our story", local.churchHistory],
    ["Serving our community", local.communityOutreach],
    ["Why we started a school", local.schoolVision],
    ["A welcome from our leadership", local.leadershipWelcome],
    ["Local traditions", local.localTraditions],
    ["Our community", local.localDescription],
    ["Denominational identity", local.denomination],
    ["Statement of faith", local.statementOfFaith],
    ["Spiritual formation", local.spiritualFormation],
  ].filter((item): item is [string, string] => Boolean(item[1]?.trim())) : [];
  const image = local?.branding.heroImage;
  const logo = local?.branding.logoImage;
  const roleForSlot: Record<keyof PublicSchoolSiteMedia, import("./template-sample-images").TemplatePhotographyRole> = {
    hero:"hero", about:"story_01", academics:"program_01",
    studentLife:"community_01", families:"community_02", campus:"story_02",
  };
  const sampleForRole = (role:import("./template-sample-images").TemplatePhotographyRole) => {
    const sample=templateSampleImage(templateId,role);
    return sample ? {src:sample,altText:demo ? "School community photography" : "Template photography, not this school's students or facilities",
      assetId:"template-sample",sourceRevision:"v3"} : null;
  };
  const sampleMedia = (slot:keyof PublicSchoolSiteMedia) => sampleForRole(roleForSlot[slot]);
  // The full twelve-scene set is enabled for a hosted fictional school only
  // after the operator verifies all assets and enables the photo-readiness gate.
  const fullDemoPhotoLibrary = demo && process.env.CAN_TEMPLATE_PHOTO_EXTRA_SECTIONS_ENABLED === "true";
  const ownedMedia = (slot:keyof PublicSchoolSiteMedia) => {
    if(options?.templateGallery || sampleTemplate || fullDemoPhotoLibrary)return sampleMedia(slot);
    const candidate=page.media?.[slot];
    if(candidate) {
      try {
        const url=new URL(candidate.src);
        if(url.protocol==="https:" && url.host===host &&
          /^\/media\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(url.pathname) &&
          !url.search && !url.hash)return candidate;
      }catch{ /* Invalid photo URL: never treat it as approved. */ }
    }
    if(options?.localPreview)return sampleMedia(slot);
    const sample=templateDefaultImage(templateId,slot==="hero"?"hero":"story_01");
    return sample?{...sample,assetId:"template-sample",sourceRevision:"v1"}:null;
  };
  // Cloudflare receives bandwidth-appropriate responsive variants from its
  // private R2-backed Images binding. Netlify and user-owned media are unchanged.
  const responsiveTemplatePhotos=process.env.CAN_TEMPLATE_PHOTO_RESPONSIVE_ENABLED==="true";
  const responsiveAttrs=(source:string,placement:"hero"|"interior"|"mosaic")=>
    templateResponsiveAttributes(source,placement,responsiveTemplatePhotos);
  const heroPhotoElement=(source:string,altText:string,media?:PublicSchoolSiteMedia[keyof PublicSchoolSiteMedia])=>{
    const imageMarkup='<img class="hero-background-image" src="' +
      escapePublicHtml(source) + '"' + mediaImageAttributes(media) + responsiveAttrs(source,"hero") +
      ' alt="' + escapePublicHtml(altText) +
      '" decoding="async" fetchpriority="high"/>';
    const artDirection=templateHeroPictureSources(source,responsiveTemplatePhotos);
    return artDirection?'<picture>'+artDirection+imageMarkup+'</picture>':imageMarkup;
  };
  const heroMedia=ownedMedia("hero");
  const approvedHero=heroMedia?.assetId==="template-sample"?null:heroMedia;
  const heroPhotoSrc=image?.dataUrl ?? heroMedia?.src;
  const heroPhotoAlt=image?.altText ?? heroMedia?.altText ?? "";
  const showingSamplePhotography=heroMedia?.assetId==="template-sample" && !image;
  const mediaImageAttributes = (media: PublicSchoolSiteMedia[keyof PublicSchoolSiteMedia] | null) => {
    if (!media) return "";
    const dimensions = media.width && media.height ? ` width="${media.width}" height="${media.height}"` : "";
    return dimensions + (media.assetId === "template-sample" && "srcSet" in media && typeof media.srcSet === "string"
      ? ` srcset="${escapePublicHtml(media.srcSet)}" sizes="(max-width: 720px) calc(100vw - 40px), 1136px"`
      : "");
  };
  const campusMosaicImages = (["academics", "studentLife", "campus"] as const).map(slot => {
    const media=ownedMedia(slot);
    return media ? '<img src="' + escapePublicHtml(media.src) +
      '"' + mediaImageAttributes(media) + responsiveAttrs(media.src,"mosaic") +
      ' alt="' + escapePublicHtml(media.altText) + '" loading="lazy" decoding="async"/>' : "";
  });
  const pageLabels: Record<PublicSitePath, string> = {
    "/": "Home", "/about": "About", "/academics": "Academics",
    "/student-life": "Student life", "/school-day": "Learning model",
    "/admissions": "Admissions", "/tuition": "Tuition & aid", "/families": "Families",
    "/faq": "FAQs", "/contact": "Contact",
    "/programs": "Programs", "/courses": "Courses", "/classes": "Classes",
  };
  const navigationLink = (destination: PublicSitePath) =>
    `<a href="${destination}"${destination === path ? ' aria-current="page"' : ""}>${pageLabels[destination]}</a>`;
  // Keep the complete ten-page site discoverable without crowding editorial
  // headers. The native disclosure works without browser-side scripts.
  const primaryNavigation = availablePaths.slice(0, 5).map(navigationLink).join(" ");
  const otherPaths = availablePaths.slice(5);
  const navigation = primaryNavigation + (otherPaths.length
    ? `<details class="desktop-more"><summary>More</summary><div class="more-links">${otherPaths.map(navigationLink).join("")}</div></details>`
    : "");
  const mobileNavigation = availablePaths.map(navigationLink).join(" ");
  const localSection = localItems.length || image ? `<section aria-labelledby="church-identity-title" class="community-section editorial-section">
    <div class="community-heading">
      <div><p class="tag">People, place & purpose</p>
      <h2 id="church-identity-title">A community with a story to tell.</h2></div>
      <p>Discover the vision and relationships behind this local learning community.</p>
    </div>
    ${image && path !== "/" ? `<img class="community-photo" src="${escapePublicHtml(image.dataUrl)}"
      alt="${escapePublicHtml(image.altText)}" loading="lazy" decoding="async"/>` : ""}
    <div class="community-stories">
      ${localItems.map(([label, value], index) => `<article class="community-story">
        <p class="story-index" aria-hidden="true">0${index + 1}</p>
        <h3>${escapePublicHtml(label)}</h3>
        <p>${escapePublicHtml(value)}</p>
      </article>`).join("\n")}
    </div>
    <p class="availability">Content provided by the local church. Community and faith content comes from the local Site editor.
    Academic, enrollment, and institutional statements are controlled separately by CAN.</p>
  </section>` : "";
  const academicCards = (page.academicPrograms ?? []).map(program => {
    const modes = [
      program.delivery.onsite ? "Onsite" : null,
      program.delivery.liveOnline ? "Live online" : null,
      program.delivery.asynchronous ? "Self-paced online" : null,
    ].filter(Boolean).join(" · ");
    const onsiteDays = program.delivery.onsiteDaysPerWeek;
    const requestId = submissionsEnabled ? options?.makeRequestId?.() : undefined;
    const applyRequestId = submissionsEnabled && program.applicationOpen === true
      ? options?.makeRequestId?.() : undefined;
    // Only the separately authorized school-of-record/admissions projection
    // can expose Apply. A live Program is NOT automatically an open school.
    // The receiving command rechecks operating authority at submission.
    const applicationForm = program.applicationOpen === true && applyRequestId ?
      `<form action="${familyStartAction}" method="post" class="inquiry-form">
        <h4>Start your school application</h4>
        <p class="availability">Verify your email first. No child information is
          collected on this public page, and guardian authority is reviewed by the school.</p>
        <input type="hidden" name="requestId" value="${escapePublicHtml(applyRequestId)}"/>
        <input type="hidden" name="programId" value="${escapePublicHtml(program.programId)}"/>
        <label>Parent or guardian first name<input name="firstName" autocomplete="given-name" maxlength="80" required/></label>
        <label>Parent or guardian last name<input name="lastName" autocomplete="family-name" maxlength="80" required/></label>
        <label>Email<input name="email" type="email" autocomplete="email" maxlength="254" required/></label>
        <div aria-hidden="true" class="bot-field"><label>Website<input name="website" tabindex="-1" autocomplete="off"/></label></div>
        <label class="consent"><input type="checkbox" name="contactConsent" value="yes" required/>
          I agree to receive an email verification link to begin or resume my application.
        </label>
        <button type="submit">Verify email to apply</button>
      </form>` : "";
    const inquiryForm = requestId ? `<form id="program-inquiry-${escapePublicHtml(program.programId)}" action="${inquiryAction}" method="post" class="inquiry-form">
        <input type="hidden" name="requestId" value="${escapePublicHtml(requestId)}"/>
        <input type="hidden" name="programId" value="${escapePublicHtml(program.programId)}"/>
        <label>First name<input name="firstName" autocomplete="given-name" maxlength="80" required/></label>
        <label>Last name<input name="lastName" autocomplete="family-name" maxlength="80" required/></label>
        <label>Email<input name="email" type="email" autocomplete="email" maxlength="254" required/></label>
        <label>Question (optional; please do not include student information)
          <textarea name="message" maxlength="500" rows="2"></textarea>
        </label>
        <div aria-hidden="true" class="bot-field">
          <label>Website<input name="website" tabindex="-1" autocomplete="off"/></label>
        </div>
        <label class="consent"><input type="checkbox" name="contactConsent" value="yes" required/>
          I agree to be contacted about this program. This is not an application or enrollment request.
        </label>
        <button type="submit">Request information</button>
      </form>` : "";
    return `<article class="card">
      <p class="tag">${escapePublicHtml(program.typeLabel)}</p>
      <h3>${escapePublicHtml(program.title)}</h3>
      <p class="season">Grades ${escapePublicHtml(program.grades.min)}–${escapePublicHtml(program.grades.max)}</p>
      <p>${escapePublicHtml(program.summary)}</p>
      <p class="availability">${escapePublicHtml(modes || "Delivery details available by inquiry")}
        ${onsiteDays !== null && program.delivery.onsite ? ` · ${onsiteDays} onsite days per week` : ""}
      </p>
      ${demo ? "" : `<p class="availability">${program.applicationOpen === true
        ? options?.localPreview && !submissionsEnabled
          ? "Applications available on the development server only · identity verification required"
          : "Applications available · identity verification required"
        : program.availability === "planned"
          ? "Program planned · admissions not open on this page"
          : "Current program · applications not currently available"}</p>`}
      ${applicationForm}
      ${inquiryForm}
    </article>`;
  }).join("\n");
  const cards = page.offerings.map(item => {
    const price = item.packages.length
      ? Math.min(...item.packages.map(option => option.priceCents))
      : item.feeAmountCents;
    const priceLabel = item.packages.length ? "Starting at " : "";
    const registrationStatus = !item.registrationOpen
      ? "Registration window not open"
      : item.seatsRemaining === 0
        ? "Waitlist may be available"
        : item.seatsRemaining === null
          ? "Registration window open"
          : `${item.seatsRemaining} seats remaining`;
    return `<article class="card">
      <p class="tag">${escapePublicHtml(item.programName)}</p>
      <h3>${escapePublicHtml(item.title)}</h3>
      <p class="season">${escapePublicHtml(item.season)} · ${escapePublicHtml(item.startsOn)} – ${escapePublicHtml(item.endsOn)}</p>
      <p class="price">${priceLabel}${escapePublicHtml(money(price))}</p>
      <p class="availability">${escapePublicHtml(registrationStatus)}</p>
    </article>`;
  }).join("\n");
  const hasOpenApplications = !demo && (page.academicPrograms ?? []).some(program => program.applicationOpen === true);
  const foundingFamilies = !demo && !hasOpenApplications && (page.academicPrograms ?? []).some(program =>
    program.availability === "planned");
  const navigationCtaPath = availablePaths.includes("/admissions") && hasOpenApplications ? "/admissions" :
    availablePaths.includes(experienceCopy.heroExplorePath) ? experienceCopy.heroExplorePath :
    availablePaths.includes("/classes") ? "/classes" :
    availablePaths.includes("/programs") ? "/programs" :
    availablePaths.includes("/courses") ? "/courses" :
    availablePaths.includes("/academics") ? "/academics" :
    availablePaths.includes("/contact") ? "/contact" : "/";
  const navigationCtaLabel = demo ? "Explore learning" : hasOpenApplications ? "Applications" :
    foundingFamilies ? "Founding families" :
    navigationCtaPath==="/classes"?"Explore Classes":
    navigationCtaPath==="/courses"?"Explore Courses":
    navigationCtaPath==="/programs"?"Explore Programs":
    navigationCtaPath==="/academics"?"Explore Academics":
    navigationCtaPath==="/contact"?"Contact":"Home";
  const firstAcademicProgram = page.academicPrograms?.[0];
  const firstInquiryHref = firstAcademicProgram
    ? previewSlug
      ? `/published-site/academics?site=${encodeURIComponent(previewSlug)}#program-inquiry-${encodeURIComponent(firstAcademicProgram.programId)}`
      : `/academics#program-inquiry-${encodeURIComponent(firstAcademicProgram.programId)}`
    : null;
  // Keep the locally authored copy while using the shared template composition
  // and current photo delivery path.
  const hero = composePublicSiteHero(templateId, {
    kicker: local?.heroHeadline ? school :
      foundingFamilies ? "Welcoming founding families" : experienceCopy.heroWelcome,
    title: local?.heroHeadline ? escapePublicHtml(local.heroHeadline) : school,
    subtitle: local?.welcomeMessage
      ? '<p class="hero-subtitle">' + escapePublicHtml(local.welcomeMessage) + '</p>' : "",
    intro: demo
      ? "Discover a school experience where strong academics, meaningful relationships, and opportunities to explore come together. See how a connected community can make learning feel personal."
      : (academicCards
      ? "Explore the learning pathways and community that could be part of your family's next chapter."
      : experienceCopy.heroIntro) + " " +
      (hasOpenApplications
        ? "Applications are available for eligible approved programs, subject to verification."
        : foundingFamilies
          ? "We are gathering interest from founding families. A request for information is not an application or an enrollment offer."
          : academicCards
            ? "Inquire about published programs; applications are not currently open through this website."
            : opportunities.length
              ? "Availability and enrollment depend on each published opportunity's current terms."
              : "Check back for published educational opportunities."),
    actions:
      (availablePaths.includes(experienceCopy.heroExplorePath)
        ? '<a class="hero-button" href="'+experienceCopy.heroExplorePath+'">'+experienceCopy.heroExplore+'</a>'
        : availablePaths.includes("/classes")?'<a class="hero-button" href="/classes">Explore Classes</a>':"") +
      (firstInquiryHref && submissionsEnabled
        ? '<a class="hero-text-link" href="' + firstInquiryHref + '">Request information</a>' : "") +
      (availablePaths.includes("/about") ? '<a class="hero-text-link" href="/about">Our story →</a>' : "") +
      (!availablePaths.includes("/academics") && availablePaths.includes("/contact")
        ? '<a class="hero-text-link" href="/contact">Contact information →</a>' : ""),
    image: heroPhotoSrc?heroPhotoElement(heroPhotoSrc,heroPhotoAlt,image?undefined:heroMedia??undefined):"",
    mosaicImages: campusMosaicImages,
  });
  // The homepage introduces the Site; detailed local content belongs on
  // About. No invented academic facts or unapproved identity records are used.
  const homeStory = local && availablePaths.includes("/about") ? `<section class="home-story editorial-section" aria-labelledby="home-story-title">
    <div class="home-story-heading"><p class="tag">Our community</p>
      <h2 id="home-story-title">${local.schoolVision && profile==="school"
        ? "A community where every student has room to grow." : experienceCopy.storyTitle}</h2></div>
    <div class="home-story-copy"><p>${escapePublicHtml(local.localDescription || local.schoolVision ||
      local.churchHistory || local.leadershipWelcome || "Learn about the people and purpose behind this community.")}</p>
      <a class="text-action" href="/about">Get to know our community →</a></div>
  </section>` : "";
  const programOverview = academicCards ? `<section class="program-overview editorial-section" aria-labelledby="academic-title">
    <div class="program-overview-heading"><div><p class="tag">Learning pathways</p>
      <h2 id="academic-title">Serious learning. A more personal path.</h2></div>
      <p>${demo ? "Strong academic foundations create the freedom to explore new interests, ask better questions, and discover how far an idea can go." : "Explore structured academic opportunities and different ways to learn. Program details and schedules are shown when confirmed."}</p></div>
    <div class="grid">${academicCards}</div>
    <a class="text-action" href="/academics">Explore all academic programs →</a>
  </section>` : "";
  const demoAcademicCards = demo && !academicCards ? `<section aria-labelledby="demo-academics-title" class="editorial-section">
    <p class="tag">An education with room to explore</p>
    <h2 id="demo-academics-title">Strong foundations. Wide-open possibilities.</h2>
    <p>Build confidence in essential subjects while discovering the connections between what you study and the world you want to shape.</p>
    <div class="grid">
      <article class="card"><p class="tag">Think deeply</p><h3>Humanities &amp; Communication</h3><p>Read thoughtfully, ask better questions, examine different perspectives, and learn to express ideas with clarity and conviction.</p></article>
      <article class="card"><p class="tag">Investigate boldly</p><h3>Science, Technology &amp; Mathematics</h3><p>Explore the principles behind everyday discoveries through inquiry, careful reasoning, and challenges that reward persistence.</p></article>
      <article class="card"><p class="tag">Create with purpose</p><h3>Design, Arts &amp; Applied Learning</h3><p>Bring imagination into practice through creative expression, collaborative projects, and opportunities to solve meaningful problems.</p></article>
    </div></section>` : "";
  const academicSection = academicCards ? `<section aria-labelledby="academic-title" class="editorial-section">
    <h2 id="academic-title">Academic programs</h2><div class="grid">${academicCards}</div></section>` : demoAcademicCards;
  const demoExperiences = demo && !page.offerings.length ? `<div class="demo-experience-grid">
    <article><p class="tag">Innovation &amp; design</p><h3>Robotics &amp; Design Lab</h3><p>Big questions become working ideas as students sketch, build, test, and refine. The real lesson is learning to think like a problem-solver.</p></article>
    <article><p class="tag">Arts &amp; expression</p><h3>The Creative Collective</h3><p>Where writing, photography, visual art, and performance give students new ways to discover their voice and share it with others.</p></article>
    <article><p class="tag">Service &amp; leadership</p><h3>Neighborhood Impact</h3><p>Students connect what they learn to the world around them, turning curiosity and compassion into projects that strengthen their community.</p></article>
  </div>` : "";
  const enrichmentSection = `<section aria-labelledby="programs-title" class="editorial-section">
    <p class="tag">Life beyond lessons</p>
    <h2 id="programs-title">${demo ? "A place to explore what makes you, you." : "Enrichment and student experiences"}</h2>
    ${demo ? "<p>Learning comes alive in the moments when students create something together, find a new passion, or discover the difference they can make.</p>" : ""}
    ${cards ? `<div class="grid">${cards}</div>` : demoExperiences ? demoExperiences : academicCards
      ? '<p class="intro">No enrichment opportunities are currently listed.</p>'
      : '<p class="empty">There are no programs to display at this time.</p>'}</section>`;
  const parentContact = page.parentInformation?.site.contact;
  const parentAddress = page.parentInformation?.site.address;
  const reviewedContact = parentContact?.canDisplay && parentContact.value?.trim()
    ? escapePublicHtml(parentContact.value) : "";
  const reviewedAddress = parentAddress?.canDisplay && parentAddress.value?.trim()
    ? escapePublicHtml(parentAddress.value) : "";
  const contactSection = `<section id="contact" aria-labelledby="contact-title" class="church-section">
    <p class="tag">${profile==="school"?"School information":"Contact information"}</p>
    <h2 id="contact-title">Connect with ${profile==="school"?"our school":"our learning community"}</h2>
    ${reviewedContact || reviewedAddress ? `<div class="contact-details">
      ${reviewedContact ? `<div><h3>Published contact information</h3><p>${reviewedContact}</p></div>` : ""}
      ${reviewedAddress ? `<div><h3>Published location</h3><p>${reviewedAddress}</p>
        <p class="availability">A published address is not confirmation that the site is open for visits.</p></div>` : ""}
      </div>` : ""}
    <p>${options?.localPreview
      ? submissionsEnabled
        ? "Use the request-information form on a published program to contact the school. This is not an application or enrollment request."
        : "This local preview is read-only. Request-information forms are available in the development server."
      : academicCards
        ? "For academic program questions, use the request-information form for a published program below."
        : reviewedContact
          ? "Use the Site's published contact information for current next steps."
          : "No public inquiry channel is currently available. This Site has not published a verified contact method."}
    ${!options?.localPreview && academicCards
      ? "An inquiry does not guarantee admission or enrollment." : ""}</p></section>`;
  const approvedSchedules = ((page.parentInformation as
    (PublicParentSchoolProfile & {programSchedules?: ApprovedProgramSchedule[]}) | undefined)
    ?.programSchedules ?? []);
  const weekDayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const schoolDay = (page.academicPrograms ?? []).map(program => {
    // A's published, source-current per-Program calendar is authoritative.
    // Never infer hours from onsiteDaysPerWeek or apply one Program's times to another.
    const approved = approvedSchedules.find(schedule =>
      schedule.programId === program.programId &&
      schedule.name.canDisplay && schedule.name.value === program.title &&
      schedule.grades.canDisplay &&
      schedule.grades.value?.min === program.grades.min &&
      schedule.grades.value?.max === program.grades.max &&
      schedule.timezone.canDisplay && Boolean(schedule.timezone.value) &&
      schedule.weeklyPattern.canDisplay && Boolean(schedule.weeklyPattern.value?.length));
    const periods = approved?.weeklyPattern.value ?? [];
    const approvedScheduleHtml = approved ? `<div class="approved-program-schedule">
      <h4>Approved weekly learning schedule</h4>
      <ul class="schedule-periods">${periods.map(period =>
        `<li><strong>${weekDayNames[period.dayOfWeek] ?? "Day not specified"}</strong>
        <span>${escapePublicHtml(period.startsAtLocal)}–${escapePublicHtml(period.endsAtLocal)}</span></li>`
      ).join("")}</ul>
      <p class="availability">Times shown in ${escapePublicHtml(approved.timezone.value ?? "")}.
        ${approved.effectiveFrom.canDisplay && approved.effectiveFrom.value
          ? `Effective from ${escapePublicHtml(approved.effectiveFrom.value)}.` : ""}
        ${approved.effectiveThrough.canDisplay && approved.effectiveThrough.value
          ? ` Through ${escapePublicHtml(approved.effectiveThrough.value)}.` : ""}
        A published learning schedule does not establish authorization to open.</p>
      </div>` : "";
    const days = program.delivery.onsiteDaysPerWeek;
    const modes = [
      program.delivery.onsite ? "Onsite learning" : null,
      program.delivery.liveOnline ? "Live online learning" : null,
      program.delivery.asynchronous ? "Self-paced online learning" : null,
    ].filter(Boolean).join(" · ");
    return `<article class="card" id="school-day-${escapePublicHtml(program.programId)}">
      <p class="tag">Grades ${escapePublicHtml(program.grades.min)}–${escapePublicHtml(program.grades.max)}</p>
      <h3>${escapePublicHtml(program.title)}</h3>
      <p>${escapePublicHtml(modes || "Contact the school for delivery details")}</p>
      ${program.delivery.onsite && days !== null ? `<p>${days} onsite days per week</p>` : ""}
      ${demo ? "" : approvedScheduleHtml || `<p class="availability">Exact schedules and days are confirmed by the school; this overview
      does not imply a Monday–Friday schedule or that the program is operating.</p>`}</article>`;
  }).join("");
  const schoolDayProgramNav = (page.academicPrograms?.length ?? 0) > 1
    ? `<nav class="program-jump-nav" aria-label="Select a program's school day">
        <p class="tag">Choose your program</p>
        <div class="program-jump-links">${(page.academicPrograms ?? []).map(program =>
          `<a href="#school-day-${escapePublicHtml(program.programId)}">${escapePublicHtml(program.title)} · Grades ${escapePublicHtml(program.grades.min)}–${escapePublicHtml(program.grades.max)}</a>`
        ).join("")}</div>
      </nav>` : "";
  const parent = page.parentInformation;
  const verifiedText = (claim: { canDisplay: boolean; value: string | null } | undefined) =>
    claim?.canDisplay && claim.value ? escapePublicHtml(claim.value) : "";
  const schoolDayDays = parent?.schoolDay.days.canDisplay
    ? parent.schoolDay.days.value : null;
  const schoolDayStart = verifiedText(parent?.schoolDay.startTime);
  const schoolDayEnd = verifiedText(parent?.schoolDay.endTime);
  // A single fully reviewed timetable is shown only when the canonical
  // projection can truthfully represent the Site. Sunday is never excluded.
  const approvedDayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const reviewedSchoolDay = demo && !approvedSchedules.length && !schoolDayDays?.length
    ? `<section class="editorial-section"><p class="tag">A connected day of learning</p><h2>Time to focus. Space to connect.</h2>
      <p>The strongest school days make room for different kinds of growth: focused study, questions and academic guidance, projects that bring ideas to life, and the relationships that help a student feel at home.</p>
      <div class="grid"><article class="card"><h3>Focused learning</h3><p>Structured lessons and individual study create space to think, revisit ideas, and build real understanding.</p></article>
      <article class="card"><h3>Guidance when it matters</h3><p>Questions become conversations, with opportunities for academic support and constructive feedback.</p></article>
      <article class="card"><h3>Community in action</h3><p>Projects, shared experiences, and time together connect learning with friendships and purpose.</p></article></div></section>`
    : !approvedSchedules.length && schoolDayDays?.length && schoolDayStart && schoolDayEnd
    ? `<section class="church-section" aria-labelledby="reviewed-day-title">
      <p class="tag">Institutionally reviewed schedule</p>
      <h2 id="reviewed-day-title">Published learning days and hours</h2>
      <p>${escapePublicHtml(schoolDayDays.map(day => approvedDayNames[day] ?? "Unknown day").join(", "))}</p>
      <p>${schoolDayStart}–${schoolDayEnd} (school-local time)</p>
      <p class="availability">These are approved instructional times, not confirmation that the school is
      authorized to receive students on any particular day. Confirm attendance and opening with the school.</p>
      </section>`
    : approvedSchedules.length
      ? `<p class="availability">Schedules differ by Program. Review each Program below for its approved weekly pattern.</p>`
      : `<p class="availability">A reviewed public timetable is not available for this school.
      Contact the school for confirmed instructional days and times.</p>`;
  // Only the separately consented and independently approved public biographies.
  const people = parent?.people ?? [];
  const peopleSection = people.length ? `<section class="people-section editorial-section" aria-labelledby="people-title">
    <p class="tag">Our people</p><h2 id="people-title">Meet our school community</h2>
    <div class="people-grid">${people.map(person => `<article class="person-card">
      <h3>${escapePublicHtml(person.displayName)}</h3>
      <p class="person-title">${escapePublicHtml(person.publicTitle)}</p>
      <p>${escapePublicHtml(person.biography)}</p></article>`).join("")}</div>
    <p class="availability">Introductions shared with permission and reviewed for public display.</p>
  </section>` : "";
  const approachCards = (page.academicPrograms ?? []).map(program => {
    const modes = [program.delivery.onsite ? "Onsite learning" : null,
      program.delivery.liveOnline ? "Live online learning" : null,
      program.delivery.asynchronous ? "Self-paced online learning" : null].filter(Boolean);
    return `<article class="approach-card"><h3>${escapePublicHtml(program.title)}</h3>
      <p>Grades ${escapePublicHtml(program.grades.min)}–${escapePublicHtml(program.grades.max)}</p>
      <ul>${modes.map(mode => `<li>${mode}</li>`).join("")}</ul></article>`;
  }).join("");
  const demoApproach = demo ? `<section class="approach-section editorial-section" aria-labelledby="approach-title">
    <p class="tag">The learning experience</p><h2 id="approach-title">Independent thinking, never learning alone.</h2>
    <p>Great learning combines clear direction with the freedom to ask questions. Structured lessons create a foundation; academic guidance and a connected local community help students turn information into understanding.</p>
    <div class="approach-grid">
      <article class="approach-card"><h3>Learn with intention</h3><p>Follow expertly structured material, revisit challenging ideas, and develop habits that last well beyond school.</p></article>
      <article class="approach-card"><h3>Ask and discover</h3><p>Bring questions to academic support and explore concepts until they begin to make sense.</p></article>
      <article class="approach-card"><h3>Belong and contribute</h3><p>Build relationships, collaborate on projects, and connect learning with the world around you.</p></article>
    </div><a class="text-action" href="/school-day">Explore the learning model →</a>
  </section>` : "";
  const approachSection = demoApproach || (approachCards ? `<section class="approach-section editorial-section" aria-labelledby="approach-title">
    <p class="tag">The learning model</p><h2 id="approach-title">How learning is organized</h2>
    <p>These delivery modes are drawn from approved Program information; instructional hours and opening authorization are reviewed independently.</p>
    <div class="approach-grid">${approachCards}</div>
    ${availablePaths.includes("/school-day") ? '<a class="text-action" href="/school-day">Explore the school day →</a>' : ""}
  </section>` : "");
  const tuitionText = verifiedText(parent?.tuition.description);
  const aidText = verifiedText(parent?.tuition.financialAid);
  const demoTuitionSection = `<section class="church-section" aria-labelledby="tuition-title">
    <p class="tag">Clarity for families</p><h2 id="tuition-title">An investment you can understand.</h2>
    <p>A thoughtful school decision starts with a clear picture of the total cost, what is included, and which financial assistance options may be available.</p>
    <div class="grid"><article class="card"><h3>Transparent tuition</h3><p>Explore a clear breakdown of tuition, fees, and what families receive as part of the learning experience.</p></article>
    <article class="card"><h3>Planning together</h3><p>Understand payment timing and the questions to ask as you build an education budget.</p></article>
    <article class="card"><h3>Financial assistance</h3><p>Learn how scholarships or other assistance could be presented alongside eligibility and application guidance.</p></article></div>
    </section>`;
  const tuitionSection = demo ? demoTuitionSection : `<section class="church-section" aria-labelledby="tuition-title">
    <h2 id="tuition-title">Tuition and costs</h2>
    <p>${tuitionText || "Reviewed tuition and fee details have not yet been published for these programs. Please request current costs before making an enrollment decision."}</p>
    <h3>Financial assistance</h3>
    <p>${aidText || "Reviewed financial assistance details are not yet available on this website. Availability and eligibility have not been established here."}</p>
    ${availablePaths.includes("/academics")
      ? '<p class="public-next-step"><a href="/academics">Choose a program to request tuition and assistance details →</a></p>'
      : availablePaths.includes("/contact")
        ? '<p class="public-next-step"><a href="/contact">Request current tuition information →</a></p>'
        : ""}</section>`;
  const serviceCards = parent?.services.filter(item => item.description.canDisplay && item.description.value)
    .map(item => `<article class="card"><h3>${escapePublicHtml(item.category.replace(/_/g, " "))}</h3>
      <p>${verifiedText(item.description)}</p></article>`).join("") ?? "";
  const admissionExplanation = verifiedText(parent?.admissions.description);
  const institutionDisclosures = parent?.disclosures
    .filter(item => item.statement.canDisplay && Boolean(item.statement.value))
    .map(item => `<div class="disclosure-item"><h3>${escapePublicHtml(item.category[0]!.toUpperCase() + item.category.slice(1))}</h3>
      <p>${verifiedText(item.statement)}</p></div>`).join("") ?? "";
  const disclosureSection = institutionDisclosures
    ? `<section class="church-section institutional-disclosures" aria-labelledby="disclosure-title">
      <p class="tag">Institutionally reviewed information</p>
      <h2 id="disclosure-title">School status and disclosures</h2>
      ${institutionDisclosures}</section>`
    : `<section class="church-section institutional-disclosures" aria-labelledby="institutional-info-title">
      <h2 id="institutional-info-title">Institutional information</h2>
      <p>Reviewed public authorization, licensure, accreditation and jurisdiction statements have not yet been published here. Their absence is not evidence that a school has or lacks a particular status.</p>
      ${availablePaths.includes("/academics") ? '<p class="public-next-step"><a href="/academics">Select a program to request current institutional information →</a></p>' : ""}
    </section>`;
  const faqItems = [
    {question:"Which programs and grades are available?",answer:(page.academicPrograms ?? []).map(program =>
      `${escapePublicHtml(program.title)}: grades ${escapePublicHtml(program.grades.min)}–${escapePublicHtml(program.grades.max)}`).join("; ")},
    {question:"What is the school-day schedule?",answer:approvedSchedules.length
      ? "Approved Program-specific schedules are available on the School Day page."
      : "A reviewed public timetable is not available yet. Please request current details."},
    {question:"Are applications open?",answer:hasOpenApplications
      ? "Some approved Programs permit verified application starts. Eligibility and capacity are checked separately."
      : "Applications are not currently open through this website. Inquiries do not constitute applications."},
    {question:"Where can I find authorization or accreditation information?",answer:institutionDisclosures
      ? "Reviewed institutional disclosures appear on the Admissions page."
      : "Reviewed public institutional statements have not yet been published. Request the current documents directly from the school."},
    {question:"What tuition information is available?",answer:tuitionText || (academicCards
      ? "Reviewed tuition and fee details are not yet published. Request current details for your program before applying." : "")},
    {question:"Which family services are offered?",answer:serviceCards
      ? "Reviewed family-service information is available on the Families page." : ""},
    {question:"Where is the school located?",answer:reviewedAddress},
    {question:"How do I contact the school?",answer:reviewedContact},
  ].filter(item=>Boolean(item.answer));
  const demoFaqItems = [
    {question:"How does this approach differ from a traditional classroom?",answer:"Students can follow structured instruction at an appropriate pace, revisit demanding lessons, and connect with academic support as questions arise. Local community experiences bring opportunities for connection and collaboration."},
    {question:"Will students have access to teachers and academic support?",answer:"The CAN model separates structured academic instruction from local supervision. Academic staff and designated support roles help learners with questions and feedback; exact availability is defined by each real Program."},
    {question:"How do students build friendships and community?",answer:"Shared projects, local gatherings, service, and enrichment can create meaningful experiences beyond individual lessons. A real school's published program confirms which activities are available."},
    {question:"How does a family know which program is right?",answer:"Begin with the child's strengths, interests, and support needs. Compare the school's reviewed academic offerings, ask about the daily experience, and confirm admissions requirements directly."},
    {question:"What happens when learning gets difficult?",answer:"A thoughtful learning model gives students space to revisit challenging ideas, ask questions and seek academic support. The exact services and support arrangements are confirmed in each school's operating program."},
  ];
  const displayedFaqItems = demo ? demoFaqItems : faqItems;
  const faqSection = displayedFaqItems.length ? `<section class="faq-list editorial-section" aria-labelledby="faq-list-title">
    <p class="tag">Questions families ask</p><h2 id="faq-list-title">Frequently asked questions</h2>
    ${displayedFaqItems.map(item=>`<details class="faq-item"><summary>${item.question}</summary><p>${item.answer}</p></details>`).join("")}
  </section>` : "";
  const demoAdmissions = `<section class="admissions-next-steps editorial-section" aria-labelledby="admissions-next-title">
    <p class="tag">Your next chapter</p><h2 id="admissions-next-title">Discover the school. Picture your place in it.</h2>
    <p>Finding the right school begins with thoughtful questions: Does this approach fit the way your child learns? Will they find encouragement, challenge, and a sense of belonging?</p>
    <div class="grid"><article class="card"><h3>01 · Explore</h3><p>Get to know the school's educational approach, values, and learning experiences.</p></article>
    <article class="card"><h3>02 · Connect</h3><p>See how a family information conversation can answer questions about day-to-day learning and support.</p></article>
    <article class="card"><h3>03 · Prepare</h3><p>Understand how a verified admissions process would guide eligible families through the next steps.</p></article></div>
    </section>`;
  const admissionsNextSteps = demo ? demoAdmissions : `<section class="admissions-next-steps editorial-section" aria-labelledby="admissions-next-title">
    <p class="tag">Planning your next step</p><h2 id="admissions-next-title">Find the answers you need to take the next step</h2>
    ${admissionExplanation ? `<p>${admissionExplanation}</p>` : ""}
    <p class="admissions-status">${hasOpenApplications
      ? "Applications are available for eligible approved programs, subject to identity verification and school review."
      : "Applications are not currently open through this website. Review published programs and inquire about next steps."}</p>
    ${availablePaths.includes("/tuition") ? '<a class="text-action" href="/tuition">Tuition and financial assistance →</a>' : ""}
    ${availablePaths.includes("/faq") ? '<a class="text-action" href="/faq">Read admissions guidance →</a>' : ""}
    ${availablePaths.includes("/contact") ? '<a class="text-action" href="/contact">Contact the school →</a>' : ""}
    </section>`;
  const interiorRoles:Partial<Record<PublicSitePath, import("./template-sample-images").TemplatePhotographyRole>> = {
    "/about":"story_01", "/academics":"program_01",
    "/student-life":"community_01", "/school-day":"program_02",
    "/admissions":"admissions", "/tuition":"story_02",
    "/families":"community_02", "/faq":"community_02", "/contact":"story_02",
  };
  const interiorMediaSlot:keyof PublicSchoolSiteMedia = path === "/about" ? "about" :
    path === "/student-life" ? "studentLife" : path === "/families" ? "families" :
    path === "/contact" ? "campus" : "academics";
  const interiorRole=interiorRoles[path];
  const siteInterior=ownedMedia(interiorMediaSlot);
  const approvedInterior = (options?.localPreview || options?.templateGallery || fullDemoPhotoLibrary) && interiorRole
    && siteInterior?.assetId === "template-sample"
    ? sampleForRole(interiorRole) : siteInterior;
  // The extra two template photography roles are intentionally mounted only
  // in fictional/private preview experiences after the full R2 library passes
  // the twelve-role readiness gate. Never imply these are real school pupils.
  const includeExtraTemplatePhotoSections=
    process.env.CAN_TEMPLATE_PHOTO_EXTRA_SECTIONS_ENABLED==="true" &&
    Boolean(options?.templateGallery || options?.localPreview || sampleTemplate || demo);
  const extraTemplatePhotoSection=(role:import("./template-sample-images").TemplatePhotographyRole,
    placement:"creative"|"portrait",label:string,title:string,summary:string)=>{
    if(!includeExtraTemplatePhotoSections)return "";
    const media=sampleForRole(role);
    if(!media)return "";
    return `<section class="template-photo-extra template-photo-extra-${placement}"
      aria-label="${escapePublicHtml(label)}">
      <img src="${escapePublicHtml(media.src)}"${responsiveAttrs(media.src,"interior")}
        alt="${escapePublicHtml(media.altText)}" loading="lazy" decoding="async"/>
      <div><p class="tag">${escapePublicHtml(label)}</p>
        <h2>${escapePublicHtml(title)}</h2>
        <p>${escapePublicHtml(summary)}</p></div>
      </section>`;
  };
  const creativeSampleSection=extraTemplatePhotoSection("program_03","creative",
    "Creative exploration","Ideas deserve room to take shape.",
    "Writing, design, and the arts make room for students to discover new ways of expressing what they know.");
  const studentPortraitSampleSection=extraTemplatePhotoSection("portrait_01","portrait",
    "Student perspective","Every student has a story worth hearing.",
    "The best learning communities make space for individual interests, friendships, and the confidence to participate.");
  const educatorPortraitSection=extraTemplatePhotoSection("portrait_02","portrait",
    "Human connection","The people who help learning come alive.",
    "Listening, encouragement, and thoughtful academic guidance give students room to ask better questions and find their own voice.");
  const communityDetailSection=extraTemplatePhotoSection("portrait_03","portrait",
    "The small moments","Growth is personal.",
    "A question explored, a challenge overcome, a new connection made: families deserve to see the moments that shape a student's journey.");
  const secondaryHero = (eyebrow: string, title: string, summary: string) =>
    `<div class="public-hero compact-hero${approvedInterior?" has-image":""}">
      ${approvedInterior ? `<img class="hero-background-image" src="${escapePublicHtml(approvedInterior.src)}"${mediaImageAttributes(approvedInterior)}${responsiveAttrs(approvedInterior.src,"interior")} alt="${escapePublicHtml(approvedInterior.altText)}" fetchpriority="high" loading="eager" decoding="async"/>` : ""}
      <p class="tag">${eyebrow}</p><h1>${title}</h1><p class="intro">${summary}</p></div>`;
  // The parent journey uses only pages backed by approved public projections.
  // This navigation is shared by all schools and never fabricates availability.
  const exploreLinks = [
    { path: "/programs", label:"Programs",description:"Explore authorized community and enrichment Programs." },
    { path: "/courses", label:"Courses",description:"Find approved public Courses and their enrollment status." },
    { path: "/classes", label:"Classes",description:"Discover published scheduled Classes and Sessions." },
    { path: "/academics", label: "Academics", description: demo ? "Explore purposeful, connected learning." : "Discover our published learning programs." },
    { path: "/school-day", label: "The school day", description: demo ? "Discover a rhythm built for focus and connection." : "Understand reviewed learning days and delivery patterns." },
    { path: "/student-life", label: "Student life", description: demo ? "Find creativity, friendship, and shared purpose." : "Explore published enrichment and activities." },
    { path: "/admissions", label: "Admissions", description: demo ? "Picture a thoughtful journey toward the right fit." : "Learn about eligibility and available next steps." },
  ].filter(link => availablePaths.includes(link.path as PublicSitePath));
  const exploreSection = exploreLinks.length > 1
    ? `<section class="explore-section editorial-section" aria-labelledby="explore-title">
      <div class="section-heading"><p class="tag">Explore the experience</p>
      <h2 id="explore-title">${profile==="school"?"Find what matters to your family":"Find your next learning experience"}</h2>
      <p>Explore independently published opportunities and the next steps available to you.</p></div>
      <div class="explore-grid">${exploreLinks.map((link, index) =>
        `<a class="explore-link" href="${link.path}"><span class="explore-number">0${index + 1}</span>
        <span class="explore-copy"><strong>${link.label}</strong><span>${link.description}</span></span>
        <span class="explore-arrow" aria-hidden="true">→</span></a>`).join("")}</div></section>`
    : "";
  // Site channels are composed as native template sections. Preview routes
  // supply data; they do not splice a second page into the rendered HTML.
  const contentBlocks = page.contentBlocks ?? [];
  const homeBlocks=contentBlocks.filter(block=>(block.page??"/")==="/");
  const hasContentChannel = (channel: SiteContentBlockProjection["channel"]) =>
    homeBlocks.some(block => block.channel === channel && block.items.length > 0);
  const contentChannelAt = (placement: SiteContentBlockProjection["placement"]) =>
    homeBlocks.filter(block => block.placement === placement)
      .map(renderSiteContentChannelBlock).join("");
  const pageBlocks=(route:PublicSitePath)=>contentBlocks
    .filter(block=>block.page===route).map(renderSiteContentChannelBlock).join("");
  const renderOpportunityDirectory=(kind:"program"|"course"|"class",
    title:string,description:string):string=>{
    const authored=pageBlocks(kind==="program"?"/programs":
      kind==="course"?"/courses":"/classes");
    if(authored)return authored;
    const records=opportunities.filter(item=>item.kind===kind);
    if(!records.length)return "";
    return renderSiteContentChannelBlock({
      id:"auto-"+kind,channel:"learning.opportunities",
      placement:"learning",layout:"cards",enabled:true,
      eyebrow:"Published learning opportunities",title,description,
      items:records.map(item=>({
        id:item.id,title:item.title,description:item.description,
        startsAt:item.startsAt,
        label:item.kind.charAt(0).toUpperCase()+item.kind.slice(1)+" · "+
          (item.status==="register"?"Enrollment available":
            item.status==="waitlist"?"Waitlist available":
            item.status==="closed"?"Registration unavailable":"Explore"),
        ...(item.action && !options?.localPreview && !options?.templateGallery
          ? {link:item.action}:{}),
      })),
    });
  };
  // Distinct template composition, one source of approved academic and Site facts.
  const homePage = composePublicSiteHome(templateId, {
    hero,
    vision: local?.schoolVision
      ? `<section class="vision-feature" aria-labelledby="vision-title"><div class="vision-number" aria-hidden="true">V.</div><div><p class="tag">Our vision</p><h2 id="vision-title">Helping students discover who they are and what they can become.</h2><p>${escapePublicHtml(local.schoolVision)}</p></div></section>` : "",
    story: homeStory,
    explore: exploreSection,
    academics: hasContentChannel("learning.academics") ? "" : programOverview || (demo ? demoAcademicCards : ""),
    channelsLearning: contentChannelAt("learning"),
    enrichment: hasContentChannel("learning.enrichment") ? "" :
      page.offerings.length || (demo && local) ? enrichmentSection
      : !academicCards && !homeBlocks.length ? `<p class="empty" role="status">There are no programs to display at this time.</p>` : "",
    channelsCommunity: contentChannelAt("community"),
    closing: demo ? `<section class="closing-action"><p class="tag">The possibilities ahead</p>
      <h2>Every student has a story worth discovering.</h2>
      <p>Explore what happens when purposeful instruction and a connected school community give students room to learn, create, and grow.</p>
      <a href="/academics" class="hero-button">Discover the learning experience</a></section>` : academicCards ? `<section class="closing-action"><p class="tag">Find your next step</p>
      <h2>Find the learning opportunity that fits your family.</h2>
      <p>The right educational environment can make a lasting difference. Explore available programs, ask questions, and decide what fits your family.</p>
      <a href="/academics" class="hero-button">Explore available programs</a></section>` : "",
    contact: reviewedContact || reviewedAddress ? contactSection : "",
    channelsClosing: contentChannelAt("closing"),
  });
  const pageContent: Record<PublicSitePath, string> = {
    "/": homePage,
    "/programs": composePublicSiteInterior(templateId,
      secondaryHero("Community programs","Programs for every stage of learning",
        "Explore independently published enrichment and community Programs. Check each Program for its current registration options."),
      renderOpportunityDirectory("program","Discover Programs",
        "Learn more about current Programs. Registration is handled through an approved Program workflow.")),
    "/courses": composePublicSiteInterior(templateId,
      secondaryHero("Independent learning","Courses to explore",
        "Discover published Courses and register only when an independently approved enrollment release is available."),
      renderOpportunityDirectory("course","Explore Courses",
        "Published Courses are linked to their current, verified enrollment release.")),
    "/classes": composePublicSiteInterior(templateId,
      secondaryHero("Learn together","Classes and scheduled Sessions",
        "Browse public Classes and their learning formats. Enrollment depends on each Class Offering's approved terms."),
      renderOpportunityDirectory("class","Explore Classes",
        "Class availability and registration methods are rechecked at the enrollment service.")),
    "/about": composePublicSiteInterior(templateId,
      secondaryHero("Our community",profile==="school"
        ?"A school shaped by purpose and the people around it.":experienceCopy.storyTitle,
      demo ? "Get to know the values, people-first philosophy, and shared ambition behind our community." :
        "Meet the people, vision and local community behind this learning Site."),
      localSection, peopleSection + educatorPortraitSection),
    "/academics": composePublicSiteInterior(templateId, secondaryHero("Learning", "Serious learning. A more personal path.",
      demo ? "Learning becomes meaningful when students can think independently, explore challenging ideas, and see the world differently." : "See the academic opportunities currently available and how different learning approaches may fit your child."), academicSection + pageBlocks("/academics"), approachSection + creativeSampleSection),
    "/student-life": composePublicSiteInterior(templateId, secondaryHero("Beyond the classroom", demo ? "Find your people. Follow your curiosity." : "Student life",
      demo ? "From creative exploration to service and student-led projects, the most memorable lessons often happen together." : "Learn about the activities and experiences currently available beyond academic lessons."), enrichmentSection + pageBlocks("/student-life"), studentPortraitSampleSection),
    "/school-day": composePublicSiteInterior(templateId, secondaryHero("Learning together", demo ? "A day designed for more than lessons." : "What a day of learning looks like",
      demo ? "A thoughtful rhythm of independent discovery, academic guidance, and time to connect." : "See how learning is organized, with confirmed schedules and attendance details where available."),
      reviewedSchoolDay + (demo ? "" : schoolDayProgramNav + `<section aria-label="Program delivery patterns" class="grid">${schoolDay}</section>` +
      (availablePaths.includes("/contact") ? '<p class="public-next-step"><a href="/contact">Ask about school-day arrangements →</a></p>' : ""))),
    "/admissions": composePublicSiteInterior(templateId, secondaryHero("For families", "The right school changes what feels possible",
      demo ? "Explore an admissions journey centered on understanding each family's questions and finding the right fit." : "Choosing a school is a personal decision. Find reviewed admissions information and the next step currently available to your family."), admissionsNextSteps, demo ? "" : academicSection + disclosureSection),
    "/tuition": composePublicSiteInterior(templateId, secondaryHero("Planning your education", "Plan with confidence",
      demo ? "Understand how transparent tuition and financial assistance information could help families plan." : "Find published costs, assistance details, and ways to request information for your family."), tuitionSection),
    "/families": composePublicSiteInterior(templateId, secondaryHero("Supporting families", "Partners in your child’s education",
      demo ? "Because learning works best when the people who care about a student can stay connected." : "Discover the resources and support information currently available to families."),
      (serviceCards ? `<section aria-label="Verified family services" class="grid">${serviceCards}</section>` :
        demo ? `<section class="editorial-section"><p class="tag">Family partnership</p><h2>In the loop. In the conversation. In your child's corner.</h2>
        <p>Families deserve more than occasional updates. Clear communication, thoughtful guidance, and opportunities to celebrate progress build a stronger connection between school and home.</p>
        <div class="grid"><article class="card"><h3>Stay connected</h3><p>Follow learning milestones, understand upcoming priorities, and know where to turn when questions come up.</p></article>
        <article class="card"><h3>Celebrate growth</h3><p>Recognize the small breakthroughs, new interests, and achievements that make each student's journey distinct.</p></article>
        <article class="card"><h3>Take part</h3><p>Find meaningful opportunities to contribute to community experiences and share in the life of the school.</p></article></div></section>` : ""), communityDetailSection),
    "/faq": composePublicSiteInterior(templateId, secondaryHero("Common questions", "The questions that matter most.",
      demo ? "Explore how learning, connection, and family partnership can work together." : "Only reviewed public information appears here."), faqSection),
    "/contact": composePublicSiteInterior(templateId, secondaryHero("Get in touch", "Start a conversation about your child's education",
      demo ? "See how a family can take the next step in learning about a school." : "Find the contact and inquiry options currently published by this school."), (demo ? `<section class="editorial-section"><p class="tag">Let's connect</p><h2>A good school conversation starts with a good question.</h2>
      <p>Want to know more about academics, student life, or how the learning model works? Explore the school story and answers to common family questions.</p>
      <a class="text-action" href="/faq">Explore family questions →</a></section>` : contactSection + academicSection) +
      (availablePaths.includes("/faq") ? '<p class="public-next-step"><a href="/faq">See common admissions questions →</a></p>' : "")),
  };
  const pageTitle = path === "/" ? `${school} | Programs` :
    `${escapePublicHtml(pageLabels[path])} | ${school}`;
  const pageDescription = path === "/" ? (foundingFamilies
    ? `Learn about planned programs at ${school} and request founding-family information. Applications are not open.`
    : `Explore programs offered through ${school}.`) :
    `Explore ${escapePublicHtml(pageLabels[path].toLowerCase())} at ${school}.`;
  const isLive = Boolean(options?.makeRequestId) && !options?.localPreview;
  const canonical = `https://${host}${path}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="${isLive && !demo ? "index,follow" : "noindex,nofollow"}"/>
${isLive ? `<link rel="canonical" href="${canonical}"/>` : ""}
<title>${pageTitle}</title>
<meta name="description" content="${pageDescription}"/>
<meta name="theme-color" content="${visual.ink}"/>
${logo ? `<link rel="icon" type="image/png" href="${escapePublicHtml(logo.dataUrl)}"/>` : ""}
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="${school}"/>
<meta property="og:title" content="${pageTitle}"/>
<meta property="og:description" content="${pageDescription}"/>
${isLive ? `<meta property="og:url" content="${canonical}"/>` : ""}
${approvedHero && !options?.templateGallery && !sampleTemplate ? `<meta property="og:image" content="${escapePublicHtml(approvedHero.src)}"/>
<meta property="og:image:alt" content="${escapePublicHtml(approvedHero.altText)}"/>` : ""}
<meta name="twitter:card" content="${approvedHero && !options?.templateGallery && !sampleTemplate ? "summary_large_image" : "summary"}"/>
<style>
:root{line-height:1.65}
body.theme-warm,body.theme-light{color:var(--site-ink);background:var(--site-paper)}
*{box-sizing:border-box}body{margin:0}header,main,footer{max-width:1240px;margin:auto;padding-left:clamp(20px,4vw,52px);padding-right:clamp(20px,4vw,52px)}
header{padding-top:24px;padding-bottom:22px;border-bottom:1px solid #dce2e8;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px}
.brand{font-size:.72rem;letter-spacing:.13em;text-transform:uppercase;font-weight:800;color:#3b5365;line-height:1.6}
h1{font-family:var(--site-display);font-size:clamp(2.8rem,7vw,6.25rem);letter-spacing:-.055em;margin:18px 0 14px;line-height:1.07;max-width:850px}
h2{font-family:var(--site-display);font-size:clamp(1.7rem,3.5vw,2.65rem);font-weight:500;letter-spacing:-.038em;margin:0 0 18px}.intro{color:#475467;max-width:700px;line-height:1.6}
main{padding-top:38px;padding-bottom:112px}main>section+section{margin-top:clamp(48px,8vw,112px)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:18px;margin-top:28px}
.card{border:1px solid #e6e2d9;border-radius:18px;padding:clamp(24px,3vw,34px);background:#fff;box-shadow:0 12px 40px rgba(22,43,66,.055)}
.card h3{font-family:var(--site-display);font-size:1.45rem;font-weight:500;line-height:1.22;margin:12px 0}
.tag{font-size:.72rem;letter-spacing:.07em;text-transform:uppercase;color:#475467;font-weight:700}
.season,.availability{font-size:.9rem;color:#475467;line-height:1.5}
.price{font-weight:700;font-size:1.16rem;margin-top:20px}
.empty{padding:28px;border:1px solid #dce2e8;border-radius:14px;background:white}
.church-section{border:1px solid #e5e2d9;border-radius:22px;padding:clamp(24px,5vw,64px);background:#fff;margin-bottom:48px}.church-section>.local-field{max-width:780px;padding:22px 0;border-top:1px solid #eeece7}.church-section>.local-field:first-of-type{border-top:0}.church-section>.local-field h3{font-family:Georgia,Cambria,serif;font-size:1.35rem;font-weight:500}
.local-field{margin-top:18px}.local-field h3{font-size:1rem;margin:0 0 6px}
.local-field p{white-space:pre-line;overflow-wrap:anywhere;color:#475467;line-height:1.6;margin:0}
.local-hero-image{display:block;width:100%;max-height:420px;object-fit:cover;border-radius:14px;margin:18px 0 24px}
footer{border-top:1px solid #dce2e8;padding-top:22px;padding-bottom:40px;font-size:.82rem;color:#667085}
.inquiry-form{margin-top:22px;padding-top:18px;border-top:1px solid #dce2e8;display:grid;gap:12px}
.inquiry-form label{display:grid;gap:5px;font-size:.82rem;color:#475467}
.inquiry-form input:not([type=checkbox]),.inquiry-form textarea{width:100%;padding:10px;border:1px solid #bcc6d2;border-radius:8px;font:inherit}
.inquiry-form .consent{display:flex;align-items:start;gap:8px;line-height:1.4}
.inquiry-form button{background:#173c60;color:white;border:none;border-radius:10px;padding:14px;font-weight:700;cursor:pointer;min-height:44px}
.inquiry-form button:hover{background:#245b88}
:focus-visible{outline:3px solid #e7a84e;outline-offset:3px}
.public-hero{min-height:440px;position:relative;isolation:isolate;overflow:hidden;border-radius:28px;background:linear-gradient(110deg,var(--site-ink),var(--site-secondary));padding:clamp(30px,6vw,70px);color:white;margin-bottom:52px}
.public-hero h1{color:white}.public-hero .intro{color:#edf3f8;max-width:670px}
.public-hero::after{content:"";position:absolute;inset:0;z-index:-1;background:var(--site-accent);opacity:.18;clip-path:polygon(0 100%,0 88%,32% 70%,56% 90%,78% 53%,100% 66%,100% 100%)}.hero-background-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2}.public-hero.has-image::before{content:"";position:absolute;inset:0;background:linear-gradient(95deg,rgba(13,34,40,.94),rgba(13,34,40,.5));z-index:-1}.public-hero.has-image::after{display:none}
.public-hero .tag{color:#e7d7bd}.hero-actions{display:flex;align-items:center;flex-wrap:wrap;gap:20px;margin-top:30px}.hero-button{display:inline-flex;align-items:center;min-height:48px;border-radius:10px;padding:12px 19px;background:#f6eee0;color:#17364d;text-decoration:none;font-weight:700}.hero-text-link{color:#fff;text-underline-offset:5px;font-weight:700}.hero-button:hover{background:#fff}.hero-button:focus-visible,.hero-text-link:focus-visible{outline:3px solid #ffda90;outline-offset:4px}
.skip-link{position:absolute;left:12px;top:-100px;z-index:10;padding:12px;background:#fff;color:#112d34}.skip-link:focus{top:12px}.mission-split{display:grid;grid-template-columns:1fr 1fr;align-items:start;gap:clamp(24px,5vw,80px);padding:clamp(20px,4vw,42px) 0}.mission-split p:last-child{font-size:clamp(1.05rem,1.6vw,1.3rem);line-height:1.75}.editorial-section>.grid{gap:20px}.closing-action{background:var(--site-ink);color:#fff;padding:clamp(30px,6vw,70px);border-radius:12px}.closing-action .tag,.closing-action p{color:#fff}.closing-action h2{max-width:700px}.closing-action .hero-button{margin-top:15px}header nav a{min-height:44px;display:inline-flex;align-items:center}.site-nav-cta{min-height:44px;display:inline-flex;align-items:center;justify-content:center;background:var(--site-ink);color:#fff;padding:10px 17px;border-radius:5px;text-decoration:none;font-weight:700;font-size:.85rem}.site-nav-cta:hover{background:var(--site-secondary)}header .brand{color:var(--site-ink)}header{position:relative}header nav{gap:clamp(8px,1.4vw,20px)}.card{border-radius:8px}.card p{overflow-wrap:anywhere}.public-hero{border-radius:12px}.church-section{border-radius:8px}.public-hero h1{overflow-wrap:break-word;hyphens:auto}.public-hero.long-name h1{font-size:clamp(1.9rem,5.6vw,5rem);letter-spacing:-.04em;max-width:950px} .mobile-menu{display:none} .mobile-menu summary{cursor:pointer;min-height:44px;display:flex;align-items:center;padding:8px 14px;border:1px solid var(--site-ink);border-radius:6px}.mobile-menu a{display:block;padding:11px 4px;min-height:44px} .mobile-menu[open]{width:100%} .mobile-menu[open] .mobile-links{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px} @media(max-width:800px){header>.desktop-nav,header>.site-nav-cta{display:none}.mobile-menu{display:block} .mission-split{grid-template-columns:1fr} .public-hero{min-height:350px}} @media(max-width:600px){.grid{grid-template-columns:1fr}.public-hero{border-radius:12px;min-height:0;padding:clamp(24px,6vw,48px)}.card{padding:22px}header{align-items:flex-start}header nav{order:3;width:100%;overflow-x:auto;flex-wrap:nowrap;white-space:nowrap;padding-top:12px}main{padding-top:24px;padding-bottom:60px}}
.section-heading{max-width:740px;margin-bottom:32px}.section-heading>p:last-child{color:#475467}.explore-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.explore-link{display:flex;align-items:flex-start;gap:16px;min-width:0;padding:clamp(18px,3vw,30px);border-top:2px solid var(--site-ink);background:#fff;color:var(--site-ink);text-decoration:none;transition:background .2s ease,transform .2s ease}.explore-link:hover{background:#f4f5f2;transform:translateY(-2px)}.explore-number{font-size:.75rem;letter-spacing:.1em;color:#526578;font-weight:700;padding-top:5px}.explore-copy{display:grid;gap:7px;flex:1;min-width:0}.explore-copy strong{font-family:var(--site-display);font-size:clamp(1.3rem,2vw,1.8rem);font-weight:500;line-height:1.2}.explore-copy>span{font-size:.9rem;color:#475467;line-height:1.55}.explore-arrow{font-size:1.4rem;line-height:1.1;align-self:center}.explore-link:focus-visible{outline:3px solid var(--site-accent);outline-offset:3px}
.public-hero.has-image{background:#16373d}.public-hero.has-image::before{background:linear-gradient(90deg,rgba(9,28,38,.96) 0%,rgba(9,28,38,.78) 52%,rgba(9,28,38,.32) 100%)}.public-hero .intro{position:relative}.inquiry-form input:not([type=checkbox]):focus-visible,.inquiry-form textarea:focus-visible{outline-offset:2px}@media(max-width:700px){.explore-grid{grid-template-columns:1fr}.explore-link{padding:20px}.public-hero.has-image::before{background:linear-gradient(90deg,rgba(9,28,38,.94),rgba(9,28,38,.67))}}@media(max-width:375px){.mobile-menu[open] .mobile-links{grid-template-columns:1fr}.public-hero h1{font-size:clamp(2.1rem,11vw,3.2rem)}.hero-actions{align-items:stretch;gap:12px}.hero-button{justify-content:center}.explore-link{gap:12px}}\n .contact-details{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:24px;margin:24px 0;padding:22px 0;border-top:1px solid #e5e2d9;border-bottom:1px solid #e5e2d9}.contact-details h3{font-family:var(--site-display);font-size:1.3rem;font-weight:500;margin:0 0 6px}.contact-details p{white-space:pre-line;overflow-wrap:anywhere;margin:0}.admissions-status{border-left:3px solid var(--site-accent);padding:12px 18px;background:#fff}.admissions-next-steps{max-width:900px}.admissions-next-steps>p:not(.tag){color:#475467;line-height:1.75}.text-action{display:inline-flex;margin:12px 20px 8px 0;color:var(--site-ink);font-weight:700;text-underline-offset:5px}.public-next-step{margin-top:32px;font-weight:700}.public-next-step a{color:var(--site-ink);text-underline-offset:5px}.disclosure-item{border-top:1px solid #e5e2d9;padding:20px 0}.disclosure-item h3{font-family:var(--site-display);font-size:1.3rem;margin:0 0 8px}.disclosure-item p{margin:0;color:#475467;white-space:pre-line;overflow-wrap:anywhere}
.community-section{margin-top:clamp(36px,8vw,108px)}.community-heading{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(230px,.7fr);gap:clamp(20px,5vw,90px);align-items:end;border-top:2px solid var(--site-ink);padding-top:30px;margin-bottom:34px}.community-heading h2{font-size:clamp(2rem,4.5vw,4.2rem);line-height:1.13;max-width:700px}.community-heading>p{color:var(--site-muted);font-size:1.06rem;line-height:1.8}.community-stories{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 clamp(22px,5vw,72px)}.community-story{padding:28px 0;border-top:1px solid #cdd2cd;min-width:0}.community-story h3{font-family:var(--site-display);font-size:clamp(1.25rem,2.4vw,1.9rem);font-weight:500;line-height:1.25;margin:8px 0 12px}.community-story p:last-child{white-space:pre-line;overflow-wrap:anywhere;color:#475467;line-height:1.75}.story-index{margin:0;font-size:.76rem;letter-spacing:.12em;font-weight:700;color:var(--site-muted)}.community-photo{width:100%;max-height:580px;object-fit:cover;margin-bottom:34px}.community-section>.availability{margin-top:16px}@media(max-width:700px){.community-heading{grid-template-columns:1fr}.community-stories{grid-template-columns:1fr}.community-story{padding:24px 0}}
.hero-subtitle{font-family:var(--site-display);font-size:clamp(1.5rem,3vw,2.85rem);font-weight:500;line-height:1.2;letter-spacing:-.028em;max-width:760px;margin:20px 0 20px;color:#fff}.public-hero h1{max-width:1100px}.public-hero.has-image .hero-subtitle{text-shadow:0 1px 12px rgba(0,0,0,.15)}
.program-jump-nav{margin:28px 0;padding:22px;border:1px solid #dce2e8;border-radius:8px}.program-jump-links{display:flex;flex-wrap:wrap;gap:12px}.program-jump-links a{display:inline-block;padding:10px 14px;border:1px solid currentColor;border-radius:5px;text-underline-offset:3px}.program-jump-links a:focus-visible{outline:3px solid var(--site-accent);outline-offset:3px}
.approved-program-schedule{margin-top:24px;padding:22px;background:var(--site-paper);border:1px solid #dce2e8;border-radius:8px}.approved-program-schedule h4{margin:0 0 14px;font-size:1.07rem}.schedule-periods{list-style:none;margin:0;padding:0}.schedule-periods li{display:flex;justify-content:space-between;gap:12px;border-top:1px solid #dce2e8;padding:12px 0;flex-wrap:wrap}.schedule-periods li strong{min-width:110px}.schedule-periods li span{font-variant-numeric:tabular-nums}.schedule-periods+.availability{margin:12px 0 0}
.inquiry-form{margin-top:22px;padding:clamp(18px,3vw,28px);background:var(--site-paper);border:1px solid #dce2e8;border-radius:10px;display:grid;gap:16px}
.inquiry-form label:not(.consent){display:flex;flex-direction:column;gap:7px;font-weight:650;font-size:.9rem}
.inquiry-form input:not([type=checkbox]):not([type=hidden]),.inquiry-form textarea{display:block;width:100%;max-width:100%;font:inherit;padding:12px 13px;border:1px solid #8b989e;border-radius:5px;background:#fff;color:#172d38}
.inquiry-form input:focus-visible,.inquiry-form textarea:focus-visible,.inquiry-form button:focus-visible{outline:3px solid var(--site-accent);outline-offset:3px}
.inquiry-form .consent{display:flex;align-items:flex-start;gap:10px;font-size:.88rem;line-height:1.5}
.inquiry-form .consent input{margin-top:4px;width:18px;height:18px;flex:0 0 18px}
.inquiry-form button{width:100%;padding:13px 18px;min-height:46px;border:0;border-radius:5px;background:var(--site-ink);color:#fff;font:inherit;font-weight:700;cursor:pointer}
.inquiry-form button:hover{filter:brightness(1.18)}
.inquiry-form h4{font-size:1.1rem;line-height:1.3;margin:0}
@media(prefers-reduced-motion:reduce){.inquiry-form button{transition:none}}
 .demo-banner{padding:9px 22px;background:#162e39;color:#f9f5ed;text-align:center;font-size:.78rem;line-height:1.5;letter-spacing:.01em}.demo-banner strong{font-weight:700}.vision-feature{display:grid;grid-template-columns:minmax(90px, .3fr) minmax(0,1fr);gap:clamp(20px,5vw,80px);background:var(--site-ink);color:#fff;padding:clamp(28px,5vw,72px);border-radius:5px;margin:clamp(24px,5vw,64px) 0}.vision-feature h2{max-width:800px;font-size:clamp(2.1rem,4.5vw,4.3rem);line-height:1.13;letter-spacing:-.045em}.vision-feature p:not(.tag){color:#e3e6e0;max-width:800px;font-size:1.1rem;line-height:1.8}.vision-feature .tag{color:#e8c996}.vision-number{font-family:var(--site-display);font-size:clamp(4rem,11vw,10rem);line-height:1;color:#d5ac69}.hero-art{pointer-events:none;position:absolute;right:-3%;bottom:-24%;width:min(52%,580px);aspect-ratio:1;border:1px solid rgba(255,255,255,.32);border-radius:50%;opacity:.55;z-index:-1}.hero-art .art-ring{position:absolute;inset:15%;border:1px solid rgba(255,255,255,.45);border-radius:50%}.hero-art .art-line{position:absolute;top:6%;left:45%;width:1px;height:90%;background:rgba(255,255,255,.35);transform:rotate(34deg)}.hero-art .art-dot{position:absolute;top:18%;left:12%;height:12px;width:12px;border-radius:50%;background:#f2d19b}.public-hero.has-image .hero-art{display:none}@media(max-width:700px){.vision-feature{grid-template-columns:1fr}.vision-number{font-size:4rem}.hero-art{width:75%;right:-30%;bottom:-18%;opacity:.3}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;transition:none!important}}
.home-story{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:clamp(30px,6vw,110px);padding:clamp(38px,6vw,84px) 0;border-block:1px solid #cdd2cd}.home-story-heading h2{max-width:660px;font-size:clamp(2.8rem,5.5vw,5.8rem);line-height:1.03}.home-story-copy{max-width:570px;align-self:center}.home-story-copy>p{font-size:clamp(1.12rem,1.65vw,1.4rem);line-height:1.72;color:var(--site-muted);white-space:pre-line}.home-story-copy .text-action{margin-top:22px}.program-overview-heading{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(220px,.8fr);gap:clamp(24px,5vw,88px);align-items:end;margin-bottom:26px}.program-overview-heading>p{font-size:1.06rem;line-height:1.7;color:var(--site-muted)}.program-overview .grid{margin-top:0}.program-overview>.text-action{margin-top:26px}.editorial-section .tag{color:var(--site-secondary)}@media(max-width:760px){.home-story,.program-overview-heading{grid-template-columns:1fr}.home-story{gap:14px;padding:42px 0}.program-overview-heading{gap:12px}}
.people-grid,.approach-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:clamp(20px,3vw,46px);margin:28px 0}.person-card,.approach-card{border-top:2px solid var(--site-ink);padding:24px 0}.person-card h3,.approach-card h3{font-family:var(--site-display);font-weight:500;font-size:clamp(1.4rem,2.2vw,2rem);margin:0 0 8px}.person-card p:last-child{white-space:pre-line;line-height:1.7;color:var(--site-muted)}.person-title{font-weight:700;font-size:.88rem;color:var(--site-secondary)}.approach-section>p:not(.tag),.approach-card p{color:var(--site-muted)}.approach-card ul{padding-left:22px;line-height:1.8}.faq-list{max-width:920px;margin-inline:auto}.faq-item{border-top:1px solid var(--site-ink);padding:20px 0}.faq-item:last-child{border-bottom:1px solid var(--site-ink)}.faq-item summary{cursor:pointer;font-family:var(--site-display);font-size:clamp(1.2rem,2vw,1.55rem);line-height:1.35;min-height:44px}.faq-item p{max-width:760px;white-space:pre-line;color:var(--site-muted);line-height:1.75}
.demo-experience-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(18px,3vw,42px);margin:36px 0 20px}.demo-experience-grid article{min-width:0;border-top:2px solid var(--site-ink);padding-top:24px}.demo-experience-grid h3{font-family:var(--site-display);font-size:clamp(1.6rem,2.4vw,2.35rem);line-height:1.18;letter-spacing:-.035em;font-weight:500}.demo-experience-grid p:last-child{color:var(--site-muted);line-height:1.7}@media(max-width:760px){.demo-experience-grid{grid-template-columns:1fr}.demo-experience-grid article{padding-top:18px}}
 .bot-field{display:none}
header nav{display:flex;flex-wrap:wrap;gap:16px;font-size:.85rem}header nav a[aria-current=page]{font-weight:800;text-decoration-thickness:2px}.compact-hero{padding-block:clamp(28px,5vw,52px)}.compact-hero h1{font-size:clamp(2.3rem,5vw,4rem)}header nav a{color:inherit;text-underline-offset:5px;text-decoration-color:#9ca9ab}header nav a:hover{text-decoration-color:currentColor}html{scroll-behavior:smooth}
/* Editorial school identity: human-scale typography, generous negative space,
   photography-ready hero and a quiet, heritage-inspired visual rhythm. */
body{font-family:var(--site-body);color:var(--site-ink);background:var(--site-paper);font-size:1.04rem;letter-spacing:-.005em}
header{padding-top:29px;padding-bottom:29px;gap:24px}
header .brand{font-family:var(--site-display);font-size:.93rem;letter-spacing:.08em;font-weight:700}
header nav{gap:clamp(14px,1.8vw,28px)}
main{padding-top:clamp(22px,3vw,48px)}
.public-hero:not(.compact-hero){min-height:clamp(510px,66vh,760px);display:flex;flex-direction:column;align-items:flex-start;justify-content:center;padding:clamp(36px,8vw,110px);border-radius:4px}
.public-hero:not(.compact-hero) h1{font-size:clamp(4rem,8.2vw,8rem);line-height:.98;max-width:880px;letter-spacing:-.072em}
.public-hero:not(.has-image){background:var(--site-ink)}
.public-hero:not(.has-image)::after{display:none}
.public-hero .hero-art{display:none}
.public-hero .intro{font-size:clamp(1rem,1.3vw,1.2rem);max-width:630px;line-height:1.7}
.public-hero .hero-subtitle{font-size:clamp(1.85rem,3.2vw,3.1rem);max-width:700px;line-height:1.2}
.editorial-section>h2,.section-heading h2{font-size:clamp(2.3rem,4.4vw,4.75rem);line-height:1.1}
.editorial-section>.grid .card{box-shadow:none;border-radius:2px;border:1px solid rgba(18,33,29,.15);padding:clamp(28px,3vw,44px)}
.explore-link{background:transparent;border-top:1px solid var(--site-ink);transition:background .15s ease}
.explore-link:hover{background:rgba(18,33,29,.055);transform:none}
.closing-action{border-radius:3px;padding-block:clamp(54px,7vw,100px)}
.closing-action h2{font-size:clamp(2.4rem,4vw,4.7rem);line-height:1.07}
.compact-hero{border-radius:3px;background:var(--site-ink);min-height:280px;padding:clamp(32px,5vw,74px)}
.compact-hero::after{display:none}
.compact-hero h1{font-size:clamp(2.6rem,5.5vw,5.6rem);line-height:1.04}
@media(max-width:700px){.public-hero:not(.compact-hero){min-height:510px;padding:32px}.public-hero:not(.compact-hero) h1{font-size:clamp(3.2rem,12vw,5.2rem)}.public-hero .hero-subtitle{font-size:clamp(1.6rem,6vw,2.4rem)}.compact-hero{min-height:240px}}

/* A Site content block uses template fonts, layout and tokens, not an injected white box. */
.site-content-block{background:transparent;color:inherit;min-width:0;max-width:100%}
.site-content-block .program-overview-heading h2{font-family:var(--site-display);letter-spacing:-.045em}
.site-content-block .program-overview-heading>p{color:var(--site-muted)}
.site-content-block .site-channel-card{min-width:0;border-radius:2px;box-shadow:none;color:var(--site-ink);background:var(--site-paper);border:1px solid var(--site-secondary);padding:clamp(22px,3vw,34px)}
.site-content-block .site-channel-card h3{font-family:var(--site-display);font-size:clamp(1.35rem,2.2vw,2rem);font-weight:500;line-height:1.18}
.site-content-block .site-channel-card>p:not(.tag){color:var(--site-muted);line-height:1.65}
.site-content-block .site-channel-grid{margin-top:18px;grid-template-columns:repeat(auto-fit,minmax(min(100%,245px),1fr))}
.site-content-block.site-channel-list .site-channel-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
.site-content-block.site-channel-list .site-channel-card{background:transparent;border:0;border-top:2px solid var(--site-ink);padding:22px 0}
.site-content-block.site-channel-featured .site-channel-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
.site-content-block.site-channel-featured .site-channel-card:first-child{grid-row:span 2;background:var(--site-secondary);color:#fff;border-color:var(--site-secondary)}
.site-content-block.site-channel-featured .site-channel-card:first-child>p,.site-content-block.site-channel-featured .site-channel-card:first-child .tag{color:inherit}
body.template-modern .site-content-block .site-channel-card{background:#142b44;border-color:#36506d;color:#eaf3ff}
body.template-modern .site-content-block .site-channel-card>p:not(.tag){color:#c0d0e1}
body.template-modern .site-content-block .site-channel-card .tag{color:#83e4f1}
body.template-modern .site-content-block .program-overview-heading>p{color:#c0d0e1}
body.template-modern .site-content-block.site-channel-list .site-channel-card{background:transparent;border-color:#607b97}
body.template-modern .site-content-block.site-channel-featured .site-channel-card:first-child{background:#225064;color:#eaf3ff}
@media(max-width:760px){.site-content-block.site-channel-list .site-channel-grid,.site-content-block.site-channel-featured .site-channel-grid{grid-template-columns:1fr}}

${publicSiteTemplateCss}
/* Consistent public preopening disclosure across all seven school designs. */
.launch-status-banner{padding:14px clamp(20px,4vw,52px);background:#fff3d8;color:#3d2d15;border-bottom:1px solid #c9a663;font:600 14px/1.55 system-ui,sans-serif}
.launch-status-banner strong{display:block;font-weight:800}
.template-photo-extra{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);
  gap:clamp(22px,4vw,56px);align-items:center;margin:42px 0;padding:clamp(18px,3vw,32px);
  border:1px solid rgba(55,65,81,.18);border-radius:12px}
.template-photo-extra img{display:block;width:100%;max-height:440px;aspect-ratio:4/3;object-fit:cover;border-radius:8px}
.template-photo-extra-portrait img{aspect-ratio:4/5;max-height:460px;max-width:350px}
.template-photo-extra h2{font-size:clamp(1.6rem,2.6vw,2.6rem);line-height:1.15}
.template-photo-extra p:last-child{line-height:1.7}
@media(max-width:760px){.template-photo-extra{grid-template-columns:1fr}
  .template-photo-extra img{max-width:100%;max-height:380px}}
${sevenSchoolCss}
.school-logo{display:inline-block;width:48px;height:48px;object-fit:contain;vertical-align:middle;margin-right:12px}.brand{overflow-wrap:anywhere}
</style>
</head>
<body class="theme-${theme} template-${templateId}" style="${visualCss}">
${demo ? `<div class="demo-banner" role="note"><strong>DEMONSTRATION SCHOOL</strong> · ${school} is fictional. All school experiences shown are examples, not real-world offerings.</div>` : ""}
${!demo&&!options?.templateGallery&&!options?.localPreview&&Boolean(page.academicPrograms?.length)&&page.operatingStatus&&page.operatingStatus!=="authorized" ? `<div class="launch-status-banner" role="note"><strong>${page.operatingStatus==="review_required"?"School opening authorization is not currently verified.":"School in development · Not yet open for enrollment."}</strong> Academic plans and opening dates remain subject to review and applicable requirements.</div>` : ""}
<a class="skip-link" href="#main-content">Skip to main content</a>
${composePublicSiteChrome(templateId, {
  brand: logo ? `<img class="school-logo" src="${escapePublicHtml(logo.dataUrl)}" alt="${escapePublicHtml(logo.altText)}" width="48" height="48" decoding="async"/>${school}` : school,
  monogram: escapePublicHtml(schoolBrandMonogram(page.site.name)),
   profile,
  navigation,
  cta: `<a class="site-nav-cta" href="${navigationCtaPath}">${navigationCtaLabel}</a>`,
  mobile: `<details class="mobile-menu"><summary>Menu</summary><nav class="mobile-links" aria-label="${experienceCopy.navLabel}">${mobileNavigation}<a href="${navigationCtaPath}">${navigationCtaLabel}</a></nav></details>`,
  main: `<main id="main-content">\n  ${options?.localPreview && !demo ? `<p role="status">${submissionsEnabled ? "Local preview. Eligible inquiry forms submit to the development database; an inquiry does not create an application or enrollment." : "Private website preview. Forms are disabled."}</p>` : ""}\n  ${showingSamplePhotography && options?.localPreview && !demo ? `<p role="note" class="template-photo-disclosure">Template photography — not actual learners or facilities of this Site.</p>` : ""}
  ${pageContent[path]}\n  <!-- Content channels are composed inside the Site template, never appended here. -->\n</main>`,
  footer: `<footer><strong>${school}</strong> · ${org} <span class="platform-credit"> · Supported by CAN Academy · ${host}</span></footer>`,
})}
</body>
</html>`.replace(/href="(\/[a-z-]*)"/g, (match, destination: string) => {
    // Local previews have distinct same-origin page endpoints. A bare
    // /academics href would escape into the CAN OS authenticated application.
    if (!previewSlug || !availablePaths.includes(destination as PublicSitePath)) return match;
    const endpoint = destination === "/" ? "/published-site" : "/published-site" + destination;
    return `href="${endpoint}?site=${encodeURIComponent(previewSlug)}"`;
  });
}

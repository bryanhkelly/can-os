import legacyManifest from "./template-sample-assets.json";
import stagedManifest from "./template-photography-v2.json";
import type { SiteTemplateId } from "./site-theme";

/** Private, fictional design samples. Never use as approved school-owned media. */
export type TemplatePhotographyRole =
  | "hero" | "story_01" | "story_02"
  | "program_01" | "program_02" | "program_03"
  | "community_01" | "community_02" | "admissions"
  | "portrait_01" | "portrait_02" | "portrait_03";

const legacyFamily: Record<SiteTemplateId, string> = {
  heritage:"heritage",
  community:"community",
  modern:"modern",
  "bright-futures":"bright",
  summit:"summit",
  classic:"heritage",
  campus:"community",
};

const stagedFamily: Record<SiteTemplateId, string> = {
  heritage:"heritage",
  community:"community",
  modern:"modern",
  "bright-futures":"bright",
  summit:"summit",
  classic:"classic",
  campus:"campus",
};

/**
 * V2 is deliberately disabled until its named JPEG objects are uploaded to R2
 * and independently verified on both deployment origins. This prevents
 * committing GitHub metadata from silently introducing broken live images.
 * Missing v2 roles do not fall back to photos from the wrong school identity.
 */
export function templateSampleImage(
  template: SiteTemplateId,
  role: TemplatePhotographyRole,
): string | null {
  if (process.env.CAN_TEMPLATE_PHOTOS_V2_ENABLED === "true") {
    const match = stagedManifest.files.find(file =>
      file.template === stagedFamily[template] && file.role === role);
    if (match) return "/" + match.key;
    // Incomplete v2 packages may use a same-template verified legacy photo,
    // but never inherit another template's images.
    if (template === "classic" || template === "campus") return null;
  }
  if (role !== "hero" && role !== "story_01") return null;
  const family=legacyFamily[template];
  const match=legacyManifest.files.find(file =>
    "template" in file && file.template === family && file.role === role &&
    file.preview_only === "no" && "width" in file && file.width >= 1000);
  return match ? "/" + match.key : null;
}

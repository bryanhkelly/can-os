import type {SiteTemplateId} from "./site-theme";

/**
 * Fictional, read-only school-website sample photographs. Never treated as
 * real school-owned or approved media.
 */
export type TemplatePhotographyRole=
  | "hero" | "story_01" | "story_02"
  | "program_01" | "program_02" | "program_03"
  | "community_01" | "community_02" | "admissions"
  | "portrait_01" | "portrait_02" | "portrait_03";

/**
 * Versioned request URLs prevent browsers/Cloudflare from continuing to show
 * old v3 hero images after the reset and subsequent replacement. Update this
 * revision only when the fictional template photography library is replaced.
 * No additional fal.ai generation is caused by this query parameter.
 */
export const TEMPLATE_PHOTO_LIBRARY_REVISION="20261109";

export function templateSampleImage(
  template:SiteTemplateId,role:TemplatePhotographyRole,
):string {
  return `/template-photo/${encodeURIComponent(template)}/${encodeURIComponent(role)}?v=${TEMPLATE_PHOTO_LIBRARY_REVISION}`;
}

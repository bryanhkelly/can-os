import manifest from "./template-sample-assets.json";
import {siteTemplateIds, type SiteTemplateId} from "./site-theme";

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

/** Local bundled hero/story defaults retained for the public Site renderer. */
export function templateDefaultImage(template:SiteTemplateId,role:"hero"|"story_01") {
  const family=template==="bright-futures"?"bright":template;
  const asset=manifest.files.find(file=>"template" in file && file.template===family &&
    file.role===role && file.preview_only==="no" && "width" in file && file.width>=1000);
  if(!asset || !("width" in asset) || !("height" in asset))return null;
  const {width,height}=asset;
  if(typeof width!=="number" || typeof height!=="number")return null;
  const src="/"+asset.key;
  const variants=manifest.responsive_widths.filter(candidateWidth=>candidateWidth<width)
    .map(candidateWidth=>({src:src.replace(/\.[^.]+$/,`-${candidateWidth}.webp`),width:candidateWidth}));
  return {src,altText:"Illustrative template image, not this school's campus or students",
    width,height,variants,
    srcSet:[...variants.map(variant=>`${variant.src} ${variant.width}w`),`${src} ${width}w`].join(", ")};
}

const templateDefaultImagePaths=new Set(siteTemplateIds.flatMap(template=>
  (["hero","story_01"] as const).flatMap(role=>{
    const image=templateDefaultImage(template,role);
    return image?[image.src,...image.variants.map(variant=>variant.src)]:[];
  }),
));

export function isTemplateDefaultImagePath(path:string):boolean {
  return templateDefaultImagePaths.has(path);
}

export function templateSampleImage(
  template:SiteTemplateId,role:TemplatePhotographyRole,
):string {
  return `/template-photo/${encodeURIComponent(template)}/${encodeURIComponent(role)}?v=${TEMPLATE_PHOTO_LIBRARY_REVISION}`;
}

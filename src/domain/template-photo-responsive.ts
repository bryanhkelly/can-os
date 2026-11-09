/**
 * Fixed browser breakpoints for fictional template preview images. They refer
 * to delivery widths, NOT additional paid image-generation jobs.
 *
 * Keep a small whitelist so Cloudflare image transformations have bounded
 * cardinality, a predictable billing profile and stable cache keys.
 */
export type TemplateImagePlacement="hero"|"interior"|"mosaic";
export const templateResponsiveWidths={
  hero:[640,960,1280,1920,2560,3840],
  interior:[480,800,1200,1600,1920],
  mosaic:[320,640,960,1280],
} as const satisfies Record<TemplateImagePlacement,readonly number[]>;

export const templateResponsiveSizes={
  hero:"100vw",
  interior:"(max-width: 700px) 100vw, (max-width: 1200px) 85vw, 1100px",
  mosaic:"(max-width: 760px) 100vw, (max-width: 1200px) 50vw, 33vw",
} as const satisfies Record<TemplateImagePlacement,string>;

const templatePhotoPath=/^\/template-photo\/(heritage|community|modern|bright-futures|summit|classic|campus)\/(hero|story_0[12]|program_0[123]|community_0[12]|admissions|portrait_0[123])(?:\?v=20261109)?$/;

/** A narrow, server-rendered HTML snippet; never construct a CDN origin URL. */
export function templateResponsiveAttributes(
  source:string,placement:TemplateImagePlacement,enabled:boolean,
):string{
  if(!enabled || !templatePhotoPath.test(source))return "";
  const widths=templateResponsiveWidths[placement];
  const joiner=source.includes("?")?"&":"?";
  const srcset=widths.map(width=>`${source}${joiner}w=${width} ${width}w`).join(", ");
  return ` srcset="${srcset}" sizes="${templateResponsiveSizes[placement]}"`;
}

/** Only allow well-known sizes for an individual asset role. */
export function allowedTemplateVariantWidth(
  role:string,raw:string|null,
):number|null|undefined{
  if(raw===null)return null;
  if(!/^[1-9]\d{2,3}$/.test(raw))return undefined;
  const candidate=Number(raw);
  const families:TemplateImagePlacement[] = role==="hero"?["hero"]
    :role.startsWith("portrait")?["interior"]
    :["interior","mosaic"];
  return families.some(family=>
    (templateResponsiveWidths[family] as readonly number[]).includes(candidate))
      ?candidate:undefined;
}

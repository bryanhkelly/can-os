import { isPublicSitePagePath, type PublicSitePath } from "./public-site-paths";
import { escapePublicHtml } from "./public-site-html";

export const websiteSharePath="/website-share";
export const websiteShareExpiryDays=7;
const hexToken=/^[0-9a-f]{64}$/;
export function parseWebsiteShareRequest(url:string) {
  const params=new URL(url).searchParams;
  if (params.getAll("token").length!==1 || params.getAll("page").length>1 ||
      [...params.keys()].some(key=>key!=="token"&&key!=="page"))return null;
  const token=params.get("token")??"";
  const page=params.get("page")??"/";
  return hexToken.test(token)&&isPublicSitePagePath(page)?{token,page}:null;
}
export function websiteSharePageUrl(token:string,page:PublicSitePath="/") {
  return websiteSharePath+"?token="+encodeURIComponent(token)+"&page="+encodeURIComponent(page);
}
/** Trusted canonical HTML, stripped of live-site outbound actions and contextualized
 * as a proposed, not-approved Site. Runs on the immutable saved snapshot only. */
export function renderShareableWebsiteHtml(html:string,token:string,pagePaths:readonly string[]) {
  const allowed=new Set(pagePaths.filter(isPublicSitePagePath));
  const noOutbound=html.replace(/\bhref="([^"]*)"/gi,(_whole,href:string)=>{
    if(href.startsWith("#")&&/^#[a-zA-Z0-9_-]*$/.test(href))return 'href="'+href+'"';
    if(isPublicSitePagePath(href)&&allowed.has(href))
      return 'href="'+websiteSharePageUrl(token,href)+'"';
    return 'aria-disabled="true"';
  });
  const banner='<aside role="status" class="can-share-preview">'+
    '<strong>Proposed Site website preview</strong>'+
    '<span>Shared for feedback · Not approved or open for enrollment</span></aside>';
  const css='<style>.can-share-preview{position:relative;z-index:99;display:flex;gap:1rem;'+
    'justify-content:center;flex-wrap:wrap;align-items:center;background:#101d39;'+
    'color:#fff;padding:13px 24px;font:600 13px/1.5 Arial,sans-serif}'+
    '.can-share-preview span{font-weight:400;color:#e2e8f0}'+
    '@media(max-width:640px){.can-share-preview{flex-direction:column;align-items:flex-start;gap:4px}}'+
    '</style>';
  return noOutbound.replace("</head>",css+"</head>")
    .replace(/(<body\b[^>]*>)/i,"$1"+banner)
    .replace("</title>"," · Proposed preview</title>");
}
export const websiteShareHeaders={
  "Content-Type":"text/html; charset=utf-8",
  "Cache-Control":"private, no-store",
  "X-Robots-Tag":"noindex, nofollow, noarchive",
  "Referrer-Policy":"no-referrer",
  "X-Content-Type-Options":"nosniff",
  "X-Frame-Options":"DENY",
  "Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data: https://*.can-os.com; form-action 'none'; script-src 'none'; base-uri 'none'; frame-ancestors 'none'",
} as const;
export function websiteShareUnavailableHtml() {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Preview unavailable</title></head>'+
    '<body style="font:16px/1.6 Arial,sans-serif;padding:32px"><h1>Preview unavailable</h1>'+
    '<p>This shared preview has expired, been revoked, or is not available.</p></body></html>';
}

import { isPublicSitePagePath } from "./public-site-paths";

/** Keep navigation inside an authenticated Site-first preview, rather than
 * sending an operator from the iframe into the CAN application shell.
 * This transforms only verified Site page links produced by the canonical
 * renderer. Course/Class/Program enrollment URLs are never rewritten. */
export function linkPrivateSitePreviewPages(
  renderedHtml: string,
  siteId: string,
): string {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8a-f0-9]{4}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(siteId))
    throw new Error("A valid Site ID is required for private navigation");
  return renderedHtml.replace(/href="(\/[a-z-]*)"/g,(full, path: string)=>{
    if (!isPublicSitePagePath(path)) return full;
    const query=new URLSearchParams({siteId,page:path});
    return 'href="/launch/site-preview?'+query.toString().replaceAll("&","&amp;")+'"';
  });
}

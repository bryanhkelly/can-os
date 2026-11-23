import { createFileRoute } from "@tanstack/react-router";
import { readSmallUrlEncodedBody } from "@/domain/public-admissions-interest";
import { hasConfiguredPublicOrigin, publicHtmlResponse } from "@/lib/public-html-response.server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function page(body:string,status=200) {
  return publicHtmlResponse(body,{title:"Email preferences",maxWidth:"36rem",status});
}
const unknown = () => page("<h1>Link unavailable</h1><p>Request a new email preference link from the sender.</p>",404);
function allowed(request:Request) {
  return hasConfiguredPublicOrigin(request,{localPreviewPath:"/marketing/unsubscribe"});
}

/** GET never opts anyone out: mail security scanners frequently follow links.
 * POST requires the unique recipient bearer token, with no account disclosure.
 */
export const Route = createFileRoute("/marketing/unsubscribe")({
  server:{handlers:{
    GET:async ({request}) => {
      if (!allowed(request)) return unknown();
      const url = new URL(request.url);
      const batchId = url.searchParams.get("batchId") ?? "";
      const key = url.searchParams.get("key") ?? "";
      if (!uuid.test(batchId) || !uuid.test(key)) return unknown();
      const { readSiteMarketingUnsubscribe } = await import(
        "@/modules/programs/site-marketing-email.server");
      const record = await readSiteMarketingUnsubscribe(batchId,key);
      if (!record) return unknown();
      if (record.optedOut) return page("<h1>Unsubscribed</h1><p>You will not receive further marketing emails from this Site.</p>");
      return page("<h1>Unsubscribe from marketing emails?</h1>" +
        "<p>Confirm to stop receiving marketing email from this organization. This will not affect essential service messages.</p>" +
        '<form method="post" action="/marketing/unsubscribe">' +
        '<input type="hidden" name="batchId" value="' + batchId + '">' +
        '<input type="hidden" name="key" value="' + key + '">' +
        '<button type="submit">Unsubscribe</button></form>');
    },
    POST:async ({request}) => {
      if (!allowed(request) || request.headers.get("origin") !== new URL(request.url).origin)
        return unknown();
      let batchId:string;
      let key:string;
      try {
        const params = await readSmallUrlEncodedBody(request);
        batchId = params.get("batchId") ?? "";
        key = params.get("key") ?? "";
        if (!uuid.test(batchId) || !uuid.test(key)) return unknown();
      } catch {
        return page("<h1>Unable to update preferences</h1><p>Please try the original link again.</p>",400);
      }
      const { unsubscribeSiteMarketingEmail } = await import(
        "@/modules/programs/site-marketing-email.server");
      const changed = await unsubscribeSiteMarketingEmail(batchId,key);
      return changed
        ? page("<h1>Unsubscribed</h1><p>You will not receive further marketing emails from this Site.</p>")
        : unknown();
    },
  }},
});

import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sites } from "@/db/schema";
import { isPublicSitePagePath } from "@/domain/public-site-paths";
import {
  activePreviewShare, previewShareUnavailable, readSitePreviewShares,
  renderSharedSitePreview, sitePreviewShareHeaders, validPreviewShareToken,
} from "@/domain/site-preview-sharing";

const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[1-8a-f\d]{4}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
function unavailable() {
  return new Response(previewShareUnavailable(),
    { status: 404, headers: sitePreviewShareHeaders });
}

/** A view-only, unlisted preview of a fixed website snapshot.
 * Bearer link access is independent of CAN OS identity, Site publication
 * and enrollment. Each request verifies revocation/expiry server-side.
 */
export const Route = createFileRoute("/site-preview-share")({
  server: { handlers: {
    GET: async ({ request }) => {
      const params = new URL(request.url).searchParams;
      const siteIds = params.getAll("siteId");
      const tokens = params.getAll("token");
      const paths = params.getAll("page");
      const page = paths[0] ?? "/";
      if (siteIds.length !== 1 || tokens.length !== 1 || paths.length > 1 ||
        [...params.keys()].some(key => !["siteId", "token", "page"].includes(key)) ||
        !uuid.test(siteIds[0] ?? "") || !validPreviewShareToken(tokens[0] ?? "") ||
        !isPublicSitePagePath(page)) return unavailable();
      try {
        const [site] = await db.select({
          lifecycleStatus: sites.lifecycleStatus,
          metadata: sites.metadata,
        }).from(sites).where(eq(sites.id, siteIds[0]!)).limit(1);
        if (!site || site.lifecycleStatus === "closed") return unavailable();
        const share = activePreviewShare(readSitePreviewShares(site.metadata), tokens[0]!, new Date());
        const html = share?.pages[page];
        if (!share || !html) return unavailable();
        return new Response(
          renderSharedSitePreview(html, siteIds[0]!, tokens[0]!, Object.keys(share.pages)),
          { status: 200, headers: sitePreviewShareHeaders },
        );
      } catch (error) {
        // Never emit bearer tokens, Site metadata, sensitive private content
        // or SQL in public request logs.
        console.warn("Shared Site preview unavailable", {
          errorType: error instanceof Error ? error.name : "unknown",
        });
        return unavailable();
      }
    },
  } },
});

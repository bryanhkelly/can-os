import { createHash } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { siteWebsitePreviewShares } from "@/db/schema";
import { parseWebsiteShareRequest, renderShareableWebsiteHtml,
  websiteShareHeaders, websiteShareUnavailableHtml } from "@/domain/website-share-preview";

const unavailable=()=>new Response(websiteShareUnavailableHtml(),{status:404,headers:websiteShareHeaders});

/** Anonymous read of an exact sanitized Site snapshot, not a public Site publication. */
export const Route=createFileRoute("/website-share")({
  server:{handlers:{GET:async ({request})=>{
    const input=parseWebsiteShareRequest(request.url);
    if(!input)return unavailable();
    try {
      const digest=createHash("sha256").update(input.token).digest("hex");
      const [row]=await db.select({pages:siteWebsitePreviewShares.pages})
        .from(siteWebsitePreviewShares)
        .where(and(eq(siteWebsitePreviewShares.tokenSha256,digest),
          isNull(siteWebsitePreviewShares.revokedAt),
          gt(siteWebsitePreviewShares.expiresAt,new Date()))).limit(1);
      const html=row?.pages[input.page];
      if(!html)return unavailable();
      return new Response(renderShareableWebsiteHtml(html,input.token,Object.keys(row.pages)),
        {status:200,headers:websiteShareHeaders});
    } catch (error) {
      console.error("Shared website preview read failed",{
        errorType:error instanceof Error?error.name:"unknown",
      });
      return unavailable();
    }
  }}},
});

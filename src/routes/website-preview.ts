import { createFileRoute } from "@tanstack/react-router";
import { AuthorizationError } from "@/domain/command-context";
import {
  parsePrivateWebsitePreviewRequest, privateWebsitePreviewHeaders,
  privateWebsitePreviewErrorPage, renderPrivateWebsitePreviewHtml,
} from "@/domain/private-website-preview";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { getPartnerWebsitePreview } from "@/modules/sites/site-website-preview.server";

function failure(status: number, title: string, message: string) {
  return new Response(privateWebsitePreviewErrorPage(title, message), {
    status, headers: privateWebsitePreviewHeaders,
  });
}

/**
 * The same email-and-code session as CAN OS, scoped to the verified current
 * Site grant. This is neither an anonymous preview, a public site alias nor a
 * new source of academic/admissions authority. No POST handlers exist here.
 */
export const Route = createFileRoute("/website-preview")({
  server: { handlers: {
    GET: async ({ request }) => {
      const selection = parsePrivateWebsitePreviewRequest(request.url);
      if (!selection) return failure(404, "Preview unavailable", "Choose a school website from the Website & Brand Studio.");

      let actor;
      try {
        actor = await getCommandContext(request);
      } catch (error) {
        if (!(error instanceof AuthorizationError))
          return failure(503, "Preview temporarily unavailable", "The sign-in service could not confirm this session.");
        const target = new URL("/access", request.url);
        target.searchParams.set("returnTo",
          new URL(request.url).pathname + new URL(request.url).search);
        return Response.redirect(target, 302);
      }

      if (actor.grantSiteId !== selection.siteId)
        return failure(403, "Website preview access required",
          "Switch to your authorized school membership in CAN OS before opening this preview.");

      try {
        // Executes the same membership, role, organization and Site checks
        // used by the canonical website editor. Reviewers must have an
        // existing authorized website-editor or Site Admin grant.
        const view = await getPartnerWebsitePreview(actor);
        if (view.siteId !== selection.siteId)
          return failure(403, "Website preview access required", "This school is outside the active membership.");
        if (view.currentRevision === 0)
          return failure(409, "No saved design yet",
            "Open Website & Brand Studio and save the private website draft before sharing its preview.");
        const html = view.previewPages[selection.page];
        if (!html)
          return failure(404, "Page not available",
            "This school has not configured the requested page in its current website design.");

        return new Response(renderPrivateWebsitePreviewHtml(
          html, view.siteId, Object.keys(view.previewPages),
        ), { status: 200, headers: privateWebsitePreviewHeaders });
      } catch (error) {
        if (error instanceof AuthorizationError)
          return failure(403, "Website preview access required",
            "Only authorized Site Administrators and website editors can view saved private designs.");
        console.error("Private school website preview failed", {
          operation: "website_preview_read",
          errorType: error instanceof Error ? error.name : "unknown",
        });
        return failure(503, "Website preview temporarily unavailable",
          "The saved website could not be loaded. Return to Website & Brand Studio to retry.");
      }
    },
  }},
});

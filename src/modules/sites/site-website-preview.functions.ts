import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { getPartnerWebsitePreview } from "./site-website-preview.server";

/** Signed-in Site partner, explicit site role assignment; never an anonymous
 * tenant-host preview, publisher approval API or family-data endpoint. */
export const getPartnerWebsitePreviewView = createServerFn({ method: "GET" })
  .handler(async () => {
    setResponseHeader("Cache-Control", "private, no-store");
    return getPartnerWebsitePreview(await getCommandContext(getRequest()));
  });

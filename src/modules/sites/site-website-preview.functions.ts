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

import { z } from "zod";
import { siteLocalContentLimits } from "@/domain/site-local-content";
import { publishPartnerLocalContent } from "./site-local-content.server";

const localFields = Object.fromEntries(
  Object.entries(siteLocalContentLimits).map(([name, max]) => [
    name, z.string().max(max),
  ]),
) as Record<keyof typeof siteLocalContentLimits, z.ZodString>;
const localContentSchema = z.object(localFields).strict();

export const publishChurchWebsiteContent = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    expectedRevision: z.number().int().nonnegative(),
    content: localContentSchema,
  }).strict().parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return publishPartnerLocalContent(await getCommandContext(getRequest()), {
      operation: "save", expectedRevision: data.expectedRevision,
      content: data.content,
    });
  });

export const restoreChurchWebsiteContent = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    expectedRevision: z.number().int().nonnegative(),
    restoreRevision: z.number().int().positive(),
  }).strict().parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return publishPartnerLocalContent(await getCommandContext(getRequest()), {
      operation: "restore", expectedRevision: data.expectedRevision,
      restoreRevision: data.restoreRevision,
    });
  });

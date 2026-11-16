import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { siteContentBlockSchema } from "@/domain/site-content-channels";

export const getSiteContentChannels = createServerFn({method: "GET"})
  .validator((input: unknown) => z.object({
    siteId: z.string().uuid(),
  }).strict().parse(input))
  .handler(async ({data}) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const {readAuthorizedSiteContentChannels} = await import("./site-content-channels.server");
    return readAuthorizedSiteContentChannels(data.siteId);
  });

export const saveSiteContentChannels = createServerFn({method: "POST"})
  .validator((input: unknown) => z.object({
    siteId: z.string().uuid(),
    expectedRevision: z.number().int().min(0),
    blocks: z.array(siteContentBlockSchema).max(8),
  }).strict().parse(input))
  .handler(async ({data}) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const {saveAuthorizedSiteContentChannels} = await import("./site-content-channels.server");
    return saveAuthorizedSiteContentChannels(data);
  });

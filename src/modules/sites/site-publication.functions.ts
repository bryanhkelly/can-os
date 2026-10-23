import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { getSitePublicationDraft, reserveSitePublicAddress } from "./site-publication.server";

const uuid = z.string().uuid();

export const getSitePublicationDraftView = createServerFn({ method: "GET" })
  .validator((value: unknown) => z.object({ siteId: uuid }).strict().parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return getSitePublicationDraft(await getCommandContext(getRequest()), data.siteId);
  });

export const reserveSitePublicationAddress = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    siteId: uuid,
    slug: z.string().min(3).max(48),
  }).strict().parse(value))
  .handler(async ({ data }) =>
    reserveSitePublicAddress(await getCommandContext(getRequest()), data));

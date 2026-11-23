import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { marketingEmailScopeSchema, queueMarketingEmailSchema } from "@/domain/site-marketing-email";
import { getCommandContext } from "@/modules/identity/command-context.server";
import {
  listSiteMarketingEmailBatches, queueSiteMarketingEmail,
} from "./site-marketing-email.server";

/** Site-scoped, authenticated reads. Sending is an explicit, audited POST. */
export const listSiteMarketingEmailCampaigns = createServerFn({method:"GET"})
  .validator((value:unknown) => marketingEmailScopeSchema.parse(value))
  .handler(async ({data}) => {
    setResponseHeader("Cache-Control","private, no-store");
    const actor = await getCommandContext(getRequest());
    return listSiteMarketingEmailBatches(actor,data.siteId,data.packageId);
  });

export const queueSiteMarketingEmailCampaign = createServerFn({method:"POST"})
  .validator((value:unknown) => queueMarketingEmailSchema.parse(value))
  .handler(async ({data}) => {
    setResponseHeader("Cache-Control","private, no-store");
    const actor = await getCommandContext(getRequest());
    return queueSiteMarketingEmail(actor,data);
  });

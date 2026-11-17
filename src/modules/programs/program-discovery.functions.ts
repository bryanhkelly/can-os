import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { programDiscoveryInputSchema } from "@/domain/program-discovery";
import { z } from "zod";
import { AuthorizationError } from "@/domain/command-context";
import { resolveLaunchSiteCatalogContext } from "./launch-site-catalog.server";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { getAvailableOfferings } from "./program-discovery.server";

export const discoverPrograms = createServerFn({ method: "GET" })
  .validator((input: unknown) => programDiscoveryInputSchema.parse(input))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const context = await getCommandContext(getRequest());
    return getAvailableOfferings(context, data);
  });

/** Launch Studio accepts only public Site IDs. Identity resolution and
 * canonical Program discovery are composed on the server, never the client. */
export const discoverLaunchSitePrograms = createServerFn({method:"GET"})
  .validator((input:unknown)=>z.object({
    publicSiteId:z.string().uuid(),
    deliveryContext:z.enum(["onsite","remote","hybrid"]),
  }).strict().parse(input))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const scope=await resolveLaunchSiteCatalogContext(getRequest(),data.publicSiteId);
    if(scope.kind!=="ready")
      throw new AuthorizationError("approved Site identity and canonical program catalog");
    const items=await getAvailableOfferings(scope.actor,{
      subject:{kind:"site",siteId:scope.canonicalSiteId},
      deliveryContext:data.deliveryContext,
    });
    return {items,canonicalSiteId:scope.canonicalSiteId};
  });

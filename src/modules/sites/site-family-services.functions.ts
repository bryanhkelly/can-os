import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { db } from "@/db/client";
import { sites } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSitePublisher } from "./site-publication.server";
import { changeFamilyServicesInput, changeSiteFamilyServices } from "./site-family-services.server";
import { readSiteFamilyServices } from "@/domain/site-family-services";

export const getSiteFamilyServicesSetup = createServerFn({method:"GET"})
  .validator((value:unknown) => z.object({siteId:z.string().uuid()}).parse(value))
  .handler(async ({data}) => {
    const actor=await getCommandContext(getRequest());
    await requireSitePublisher(actor,data.siteId);
    const [row]=await db.select({metadata:sites.metadata})
      .from(sites).where(eq(sites.id,data.siteId)).limit(1);
    const snapshot=readSiteFamilyServices(row?.metadata??null);
    return {siteId:data.siteId,revision:snapshot?.revision??0,
      entries:snapshot?.entries??[],reviewedAt:snapshot?.reviewedAt??null};
  });

export const saveSiteFamilyServicesSetup = createServerFn({method:"POST"})
  .validator((value:unknown)=>changeFamilyServicesInput.parse(value))
  .handler(async ({data}) => {
    const actor=await getCommandContext(getRequest());
    return changeSiteFamilyServices(actor,data);
  });

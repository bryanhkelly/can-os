/** Browser-importable RPC contracts. Implementation lives in site-brand.server.ts. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  readSiteBrandVersionViewServer,
  saveSiteBrandVersionServer,
  revokeSiteBrandAssetServer,
} from "./site-brand.server";

import { mutationSchema } from "./site-brand.schemas";
export { assetInputSchema } from "./site-brand.schemas";
export type { SiteBrandSaveInput } from "./site-brand.schemas";

export const readSiteBrandVersionView=createServerFn({method:"GET"})
  .validator((value:unknown)=>z.object({siteId:z.string().uuid(),
    versionId:z.string().uuid().optional()}).strict().parse(value))
  .handler(async ({data})=>readSiteBrandVersionViewServer(data));

export const saveSiteBrandVersion=createServerFn({method:"POST"})
  .validator((value:unknown)=>mutationSchema.parse(value))
  .handler(async ({data})=>saveSiteBrandVersionServer(data));

export const revokeSiteBrandAsset=createServerFn({method:"POST"})
  .validator((value:unknown)=>z.object({
    siteId:z.string().uuid(),assetId:z.string().uuid(),
    reason:z.string().trim().min(8).max(500),
  }).strict().parse(value))
  .handler(async ({data})=>revokeSiteBrandAssetServer(data));

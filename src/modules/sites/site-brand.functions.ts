/** Browser-importable RPC contracts. Implementation lives in site-brand.server.ts. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { siteBrandConfigurationSchema } from "@/domain/site-brand";
import {
  readSiteBrandVersionViewServer,
  saveSiteBrandVersionServer,
  revokeSiteBrandAssetServer,
} from "./site-brand.server";

export const assetInputSchema=z.object({
  dataUrl:z.string().max(220000).regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/),
  altText:z.string().trim().max(180),
  rightsConfirmed:z.boolean(),
  childImageConsent:z.enum(["unconfirmed","no_identifiable_children","guardian_consent_confirmed"]),
}).strict();
const mutationSchema=z.object({
  siteId:z.string().uuid(),
  expectedBrandVersionId:z.string().uuid().nullable(),
  configuration:siteBrandConfigurationSchema,
  logoImage:assetInputSchema.nullable().optional(),
  heroImage:assetInputSchema.nullable().optional(),
}).strict();

export type SiteBrandSaveInput=z.infer<typeof mutationSchema>;


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

/** Shared validation contract; no authorization or database imports. */
import { z } from "zod";
import { siteBrandConfigurationSchema } from "@/domain/site-brand";

export const assetInputSchema=z.object({
  dataUrl:z.string().max(220000).regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/),
  altText:z.string().trim().max(180),
  rightsConfirmed:z.boolean(),
  childImageConsent:z.enum(["unconfirmed","no_identifiable_children","guardian_consent_confirmed"]),
}).strict();
export const mutationSchema=z.object({
  siteId:z.string().uuid(),
  expectedBrandVersionId:z.string().uuid().nullable(),
  configuration:siteBrandConfigurationSchema,
  logoImage:assetInputSchema.nullable().optional(),
  heroImage:assetInputSchema.nullable().optional(),
}).strict();

export type SiteBrandSaveInput=z.infer<typeof mutationSchema>;



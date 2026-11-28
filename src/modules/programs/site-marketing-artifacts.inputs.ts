import {z} from "zod";
import {marketingFormatIds,marketingPackageContentSchema} from "@/domain/marketing-package-v61";
const uuid=z.string().uuid();
export const scope=z.object({siteId:uuid,packageId:uuid}).strict();
export const releaseSchema=z.object({siteId:uuid,releaseId:uuid}).strict();
export const withdrawInput=releaseSchema.extend({reason:z.string().trim().min(8).max(300)}).strict();
export const previewInputSchema=z.object({
  siteId:uuid,
  title:z.string().trim().max(120),
  brandVersionId:uuid.nullable().optional(),
  format:z.enum(marketingFormatIds),
  content:marketingPackageContentSchema,
}).strict();
export const packageReleaseInput=scope.extend({
  expectedPackageRevision:z.number().int().positive(),
  requestId:uuid,
}).strict();

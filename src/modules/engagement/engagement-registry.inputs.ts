import { z } from "zod";
import { engagementDefinitionSchema, engagementOwnerSchema, engagementChannelSchema } from "@/domain/engagement-definition";

const uuid = z.string().uuid();
const createDefinitionInput = z.object({
  owner: engagementOwnerSchema,
  definition: engagementDefinitionSchema,
}).strict();
const engagementInput = z.object({engagementId:uuid}).strict();
const createLinkInput = engagementInput.extend({
  versionId:uuid,
  channel:engagementChannelSchema.optional(),
}).strict();
const linkInput = engagementInput.extend({linkId:uuid}).strict();

export const createEngagementDefinitionInput = createDefinitionInput;
export const createEngagementGoLinkInput = createLinkInput;
export const listEngagementGoLinksInput = engagementInput;
export const retireEngagementDefinitionInput = engagementInput;
export const revokeEngagementGoLinkInput = linkInput;
export const listSiteEngagementDefinitionsInput = z.object({
    siteId:uuid,packageId:uuid,
  }).strict();
export const prepareEngagementEmailDraftInput = linkInput;
export const listOwnerEngagementDestinationsInput = z.object({owner:engagementOwnerSchema,siteId:uuid.optional(),kind:z.enum(["information","adult-training"]),term:z.string().trim().max(90).optional()}).strict();
export const listOwnerEngagementDefinitionsInput = z.object({owner:engagementOwnerSchema}).strict();

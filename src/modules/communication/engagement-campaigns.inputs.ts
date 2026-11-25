import { z } from "zod";

const uuid=z.string().uuid();
const input=z.object({engagementId:uuid,linkId:uuid}).strict();

export const readEngagementCampaignWorkspaceInput = input;
export const saveCampaignRecipientListInput = input.extend({name:z.string().trim().min(1).max(120),raw:z.string().max(256000),
 consentSource:z.string().trim().min(5).max(500),attested:z.literal(true)}).strict();
export const queueEngagementCampaignInput = input.extend({listId:uuid,requestId:uuid,scheduledAt:z.string().datetime(),confirmed:z.literal(true)}).strict();
export const cancelEngagementCampaignInput = input.extend({campaignId:uuid}).strict();
export const readCampaignListMembersInput = input.extend({listId:uuid,offset:z.number().int().min(0).max(1000)}).strict();
export const updateCampaignListMemberInput = input.extend({listId:uuid,email:z.string().max(254),operation:z.enum(["remove","withdraw"]),confirmed:z.literal(true)}).strict();

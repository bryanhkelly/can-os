import {z} from "zod";
const id=z.string().uuid();
export const roomInput=z.object({facilitatedSessionId:id}).strict();
export const learnerInput=roomInput.extend({courseAttemptId:id}).strict();
export const attachInput=roomInput.extend({
  surveyCampaignId:id,stage:z.enum(["entry","pulse","exit"]),
}).strict();

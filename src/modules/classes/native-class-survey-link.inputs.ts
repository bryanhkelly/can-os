import {z} from "zod";
const uuid=z.string().uuid();
export const select=z.object({classId:uuid}).strict();
export const link=select.extend({campaignId:uuid}).strict();

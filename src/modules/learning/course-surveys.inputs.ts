import {z} from "zod";
const id=z.string().uuid();
export const scope=z.object({courseAttemptId:id,campaignId:id}).strict();
export const submission=scope.extend({answers:z.array(z.object({
  questionId:id,text:z.string().max(4000).optional(),number:z.number().finite().optional(),
  optionIds:z.array(id).max(100).optional(),
}).strict()).max(100)}).strict();
export const courseInput=z.object({courseAttemptId:id}).strict();

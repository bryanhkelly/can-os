import {z} from "zod";
export const input = z.object({ registrationId: z.string().uuid() }).strict();
export const queueInput=z.object({
  page:z.number().int().min(0).max(100).default(0),
}).strict();

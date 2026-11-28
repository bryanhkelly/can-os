import {z} from "zod";
export const input=z.object({courseAttemptId:z.string().uuid()}).strict();

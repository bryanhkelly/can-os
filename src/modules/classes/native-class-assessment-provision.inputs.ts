import {z} from "zod";
export const input=z.object({classEnrollmentId:z.string().uuid()}).strict();

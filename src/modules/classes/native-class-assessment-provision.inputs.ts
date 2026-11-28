import {z} from "zod";
export const input=z.object({classEnrollmentId:z.string().uuid(),phase:z.enum(["baseline","final"]).default("final")}).strict();

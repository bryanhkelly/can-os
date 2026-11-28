import {z} from "zod";
export const inputSchema = z.object({
  credentialDefinitionVersionId: z.string().uuid(),
  completionDecisionId: z.string().uuid(),
}).strict();

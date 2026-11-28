import { z } from "zod";
export const previewInput = z.object({trainingVersionId:z.string().uuid(),format:z.enum(["pdf","badge_svg","badge_json"])}).strict();

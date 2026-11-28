import { z } from "zod";
export const downloadInput = z.object({issuanceId:z.string().uuid(),format:z.enum(["pdf","badge_svg","badge_json"])}).strict();

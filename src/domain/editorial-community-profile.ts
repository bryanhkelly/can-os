import { z } from "zod";
import { communityIndicators } from "./geographic-intelligence";
const measure=z.object({variable:z.string(),estimate:z.number().int().nonnegative().nullable(),marginOfError:z.number().int().nonnegative().nullable()}).strict();
const indicators=z.object(Object.fromEntries(Object.keys(communityIndicators).map(key=>[key,measure]))).strict();
export const editorialCommunityProfileSchema=z.object({
 areaCode:z.string().max(80),areaName:z.string().max(200),source:z.literal("acs5"),
 year:z.number().int().min(2020).max(2100),indicators,
}).strict();
export type EditorialCommunityProfile=z.infer<typeof editorialCommunityProfileSchema>;

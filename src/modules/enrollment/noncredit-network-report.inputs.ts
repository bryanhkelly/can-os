import {z} from "zod";
import {geographyFilterSchema} from "@/domain/geographic-reporting";
export const params=z.object({geography:geographyFilterSchema}).strict();

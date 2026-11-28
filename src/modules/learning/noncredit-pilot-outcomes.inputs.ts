import {z} from "zod";
import {geographyFilterSchema} from "@/domain/geographic-reporting";
export const params=z.object({
  geography:geographyFilterSchema,
  siteId:z.string().uuid().optional(),
  from:z.string().datetime({offset:true}).optional(),
  to:z.string().datetime({offset:true}).optional(),
}).strict();

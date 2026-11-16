import { z } from "zod";
import { classDeliveryModeSchema } from "./unified-class";

/**
 * Portable, content-light setup recipe. It carries NO Site grant,
 * enrollment data, private consent, personnel or publishing authorization.
 * Every receiving Site must independently select an approved adoption and
 * be authorized by createUnifiedClassDraft.
 */
export const networkClassLaunchRecipeSchema=z.object({
  version:z.literal(1),
  courseVersionId:z.string().uuid(),
  courseTitle:z.string().trim().min(1).max(200),
  suggestedClassTitle:z.string().trim().min(3).max(200),
  deliveryMode:classDeliveryModeSchema,
  capacity:z.number().int().positive().nullable(),
  recommendedSessionMinutes:z.number().int().min(15).max(480),
}).strict();
export type NetworkClassLaunchRecipe=z.infer<typeof networkClassLaunchRecipeSchema>;

export function serializeNetworkClassLaunchRecipe(recipe:NetworkClassLaunchRecipe):string{
  return JSON.stringify(networkClassLaunchRecipeSchema.parse(recipe),null,2);
}
export function parseNetworkClassLaunchRecipe(raw:string):NetworkClassLaunchRecipe{
  if(raw.length>4000)throw new Error("Class launch recipe is too large.");
  let value:unknown;
  try{value=JSON.parse(raw);}catch{throw new Error("Enter a valid JSON Class launch recipe.");}
  return networkClassLaunchRecipeSchema.parse(value);
}

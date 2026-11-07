import { z } from "zod";
import { usStatesAndTerritories } from "./site-setup-configuration";

/** Planning location only; never substitute this for a verified physical address. */
export const schoolPlanningLocationSchema = z.object({
  city: z.string().trim().min(1).max(120),
  state: z.string().trim().toUpperCase().refine(value => Object.hasOwn(usStatesAndTerritories, value), "Choose a state or territory"),
}).strict();

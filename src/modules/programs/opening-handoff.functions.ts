import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActor } from "@/modules/identity/actors.server";
import { acknowledgeOpeningHandoff,transferOpeningHandoff,openingHandoffManagerCapability } from "./opening-handoff.server";

export const acknowledgeLaunchHandoff = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    actionId: z.string().uuid(), note: z.string().trim().min(10).max(2000), confirmed: z.literal(true),
  }).strict().parse(value))
  .handler(async ({ data }) => {
    const actor = await requireActor(["registrar"], "action.resolve");
    return acknowledgeOpeningHandoff(actor, data);
  });

export const transferLaunchHandoff=createServerFn({method:"POST"})
  .validator((value:unknown)=>z.object({
    actionId:z.string().uuid(),expectedRevision:z.number().int().nonnegative(),requestId:z.string().uuid(),
    recipientPersonId:z.string().uuid(),reason:z.string().trim().min(10).max(2000),confirmed:z.literal(true),
  }).strict().parse(value))
  .handler(async({data})=>{
    const actor=await requireActor(["registrar"],openingHandoffManagerCapability);
    return transferOpeningHandoff(actor,data);
  });

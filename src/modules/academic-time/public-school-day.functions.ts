import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { approvePublicSchoolDay } from "./public-school-day-approval.server";

/** Explicit institutional review of the already-saved academic timetable. */
export const approveSchoolDayPublicSummary = createServerFn({method:"POST"})
  .validator((value:unknown)=>z.object({
    siteId:z.string().uuid(),programId:z.string().uuid(),
    scheduleTemplateId:z.string().uuid(),
    expectedRevision:z.number().int().nonnegative(),
    reviewed:z.literal(true),
  }).strict().parse(value))
  .handler(async ({data})=>{
    const actor=await getCommandContext(getRequest());
    return approvePublicSchoolDay(actor,data);
  });

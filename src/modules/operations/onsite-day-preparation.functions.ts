import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { assertOnsiteAttendanceScope } from "@/domain/onsite-attendance-access";
import { AuthorizationError } from "@/domain/command-context";
import { loadExpectedSchoolDayPreparation } from "@/modules/attendance/onsite-attendance-workflow.functions";
import { loadOnsiteSupervisionPlanForActor } from "./onsite-supervision.functions";

export const getOnsiteSchoolDayPreparation=createServerFn({method:"GET"})
  .validator((value:unknown)=>z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).strict().parse(value))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCommandContext(getRequest());
    assertOnsiteAttendanceScope(actor);
    if(actor.role!=="site_leader"||actor.sessionAccountId)
      throw new AuthorizationError("local director school-day preparation");
    const roster=await loadExpectedSchoolDayPreparation(actor,data);
    // Restrict the staffing projection to the Programs whose current director
    // relationship passed the canonical roster's authorization checks.
    const plan=await loadOnsiteSupervisionPlanForActor({...actor,scope:{...actor.scope,
      programIds:roster.programs.map(program=>program.id)}},{date:data.date,siteId:roster.site.id,preparation:true});
    return {date:data.date,siteId:roster.site.id,timezone:roster.site.timezone,
      programs:roster.programs,students:roster.students,sectionMemberships:roster.sectionMemberships,unplacedStudents:roster.unplacedStudents,
      blocks:plan.blocks.map(({facilitatorPersonId:_primary,backupPersonId:_backup,...block})=>block),
      projectionTruncated:plan.projectionTruncated,
      note:"Preparation previews the current schedule, enrollment and reviewed coverage. It records no attendance, staff arrival, custody release or permission to open. Recheck current authority on the operating day.",
    };
  });

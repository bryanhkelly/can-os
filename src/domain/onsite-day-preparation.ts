import { AuthorizationError } from "./command-context";
import type { AccessContext } from "./access-context";
import { assertOnsiteAttendanceScope } from "./onsite-attendance-access";
import { siteDate } from "./expected-attendance";

/** Preparation is a director read, not authority to record future facts. */
export function assertSchoolDayPreparation(actor:AccessContext,
  site:{id:string;organizationId:string;timezone:string},date:string,now=new Date()){
  assertOnsiteAttendanceScope(actor,site.id);
  if(actor.role!=="site_leader"||actor.demoFacilitator||!actor.scope.organizationIds?.includes(site.organizationId))
    throw new AuthorizationError("current original-Site director for school-day preparation");
  const stamp=new Date(date+"T12:00:00Z");
  const today=siteDate(now,site.timezone);
  const through=siteDate(new Date(now.getTime()+30*86400_000),site.timezone);
  if(!Number.isFinite(stamp.getTime())||stamp.toISOString().slice(0,10)!==date||date<today||date>through)
    throw new Error("Choose a valid school-local preparation date today or within the next 30 days");
  return {today,through};
}

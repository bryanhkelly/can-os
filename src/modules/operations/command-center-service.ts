import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { actions, enrollments, instructionalCapacityReservations, programs, sectionCapacityDemands, sectionTeachers, sections } from "@/db/schema";
import { assertCapability, AuthorizationError, type CommandContext } from "@/domain/command-context";

/** Live operational exceptions, not demo/synthetic fixture rows. */
export async function getSchoolOperationsCommandCenter(context: CommandContext) {
  assertCapability(context,"program.launch.start");
  if(context.role!=="registrar"||!context.scope.organizationIds?.length)throw new AuthorizationError("operations membership");
  const accessible=await db.select({id:sections.id,title:sections.title,programId:sections.programId,siteId:sections.siteId,active:sections.active})
    .from(sections).innerJoin(programs,eq(programs.id,sections.programId))
    .where(and(inArray(programs.organizationId,context.scope.organizationIds),
      ...(context.scope.programIds?[inArray(sections.programId,context.scope.programIds)]:[]),
      ...(context.scope.siteIds?[inArray(sections.siteId,context.scope.siteIds)]:[])));
  const ids=accessible.map(x=>x.id);
  if(!ids.length)return {summary:{sections:0,unstaffed:0,underCapacity:0,waitlisted:0},issues:[]};
  const [teachers,demands,commitments,waiting]=await Promise.all([
    db.select({sectionId:sectionTeachers.sectionId}).from(sectionTeachers).where(inArray(sectionTeachers.sectionId,ids)),
    db.select({sectionId:sectionCapacityDemands.sectionId,seats:sectionCapacityDemands.expectedSeats})
      .from(sectionCapacityDemands).where(inArray(sectionCapacityDemands.sectionId,ids)),
    db.select({sectionId:instructionalCapacityReservations.sectionId,seats:sql<number>`sum(seats)::int`})
      .from(instructionalCapacityReservations).where(and(
        inArray(instructionalCapacityReservations.sectionId,ids),eq(instructionalCapacityReservations.status,"committed"),
        sql`(expires_at is null or expires_at > now())`))
      .groupBy(instructionalCapacityReservations.sectionId),
    db.select({sectionId:actions.sectionId,id:actions.id}).from(actions).where(and(
      eq(actions.type,"section_waitlist"),inArray(actions.sectionId,ids),inArray(actions.status,["open","waiting"]))),
  ]);
  const teacherIds=new Set(teachers.map(x=>x.sectionId));
  const commitmentsBySection=new Map(commitments.map(x=>[x.sectionId,Number(x.seats)]));
  const waitsBySection=new Map<string,number>();
  for(const w of waiting)if(w.sectionId)waitsBySection.set(w.sectionId,(waitsBySection.get(w.sectionId)??0)+1);
  const issues:{kind:string;sectionId:string;title:string;description:string;programId:string}[]=[];
  for(const section of accessible.filter(x=>x.active)){
    if(!teacherIds.has(section.id))issues.push({kind:"unstaffed",sectionId:section.id,programId:section.programId,
      title:section.title+" needs an instructor",description:"Assign a qualified teacher or commit a compatible capacity offering."});
    const demand=demands.find(x=>x.sectionId===section.id);
    if(demand && (commitmentsBySection.get(section.id)??0)<demand.seats)
      issues.push({kind:"capacity",sectionId:section.id,programId:section.programId,title:section.title+" has a capacity gap",
        description:`${demand.seats-(commitmentsBySection.get(section.id)??0)} instructional seats still need commitment.`});
    const queue=waitsBySection.get(section.id)??0;
    if(queue)issues.push({kind:"waitlist",sectionId:section.id,programId:section.programId,
      title:section.title+" has a waitlist",description:`${queue} student(s) awaiting review or promotion.`});
  }
  return {
    summary:{sections:accessible.filter(s=>s.active).length,unstaffed:issues.filter(x=>x.kind==="unstaffed").length,
      underCapacity:issues.filter(x=>x.kind==="capacity").length,waitlisted:waiting.length},
    issues,
  };
}

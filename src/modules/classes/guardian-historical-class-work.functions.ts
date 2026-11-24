import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {sql} from "drizzle-orm";
import {z} from "zod";
import {db} from "@/db/client";
import {guardianRelationships} from "@/db/schema/identity";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {assertCapability,AuthorizationError} from "@/domain/command-context";
import {guardianRelationshipPredicate} from "@/domain/guardian-relationship";
import {readHistoricalClassWork} from "./historical-class-work.server";

/** Placement consent is not academic access. Independently require the existing
 * verified school academic relationship, exact scope and active Program membership. */
export const getGuardianNativeHistoricalWork=createServerFn({method:"GET"})
 .validator((raw:unknown)=>z.object({classEnrollmentId:z.string().uuid(),beforeId:z.string().uuid().optional()}).strict().parse(raw))
 .handler(async({data})=>{
  setResponseHeader("Cache-Control","private, no-store");
  setResponseHeader("Referrer-Policy","no-referrer");
  const context=await getCommandContext(getRequest());
  assertCapability(context,"student:related-read");
  if(context.role!=="guardian"||!context.actorPersonId||!context.scope.siteIds?.length||!context.scope.programIds?.length)
    throw new AuthorizationError("verified guardian academic membership");
  const actorPersonId=context.actorPersonId;
  const siteIds=context.scope.siteIds,programIds=context.scope.programIds;
  return db.transaction(async tx=>{
   const matches=await tx.execute(sql`
    SELECT DISTINCT ce.id,ce.class_id,ce.learner_person_id
    FROM public.class_enrollments ce
    JOIN public.classes c ON c.id=ce.class_id AND c.state='active'
    JOIN public.academic_enrollment_cutover_links link ON link.class_enrollment_id=ce.id
    JOIN public.enrollments e ON e.id=link.legacy_enrollment_id AND e.status='active' AND e.kind='section'
    JOIN public.student_profiles sp ON sp.id=e.student_profile_id AND sp.person_id=ce.learner_person_id
    JOIN public.sections sec ON sec.id=e.section_id AND sec.site_id=c.site_id AND sec.active AND sec.program_id=e.program_id
    JOIN public.terms term ON term.id=sec.term_id AND term.school_year_id=e.school_year_id
    WHERE ce.id=${data.classEnrollmentId}::uuid AND ce.status='active'
      AND e.organization_id=c.operating_organization_id
      AND c.site_id IN (${sql.join(siteIds.map(id=>sql`${id}::uuid`),sql`, `)})
      AND sec.program_id IN (${sql.join(programIds.map(id=>sql`${id}::uuid`),sql`, `)})
      AND EXISTS (SELECT 1 FROM public.enrollments pm WHERE pm.student_profile_id=sp.id
        AND pm.program_id=sec.program_id AND pm.school_year_id=term.school_year_id AND pm.kind='program' AND pm.status='active')
    LIMIT 2
   `);
   const match=matches.rows[0];
   if(matches.rows.length!==1||!match)throw new AuthorizationError("active school Class placement");
   const [relationship]=await tx.select({id:guardianRelationships.id}).from(guardianRelationships)
    .where(guardianRelationshipPredicate({guardianPersonId:actorPersonId,studentPersonId:String(match.learner_person_id),access:"academic"})).limit(1);
   if(!relationship)throw new AuthorizationError("verified guardian academic relationship");
   return readHistoricalClassWork(tx,{classId:String(match.class_id),classEnrollmentId:String(match.id),beforeId:data.beforeId,audience:"guardian"});
  });
 });

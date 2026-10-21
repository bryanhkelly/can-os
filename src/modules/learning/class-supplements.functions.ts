import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { curriculumOverlays, curriculumResources, programs } from "@/db/schema";
import { assertPublisherLessonReference } from "@/domain/publisher-course-references";
import { AuthorizationError } from "@/domain/command-context";
import { emitEvent, writeAudit } from "@/platform/mutation";
import { authorizeClass, classActor } from "./class-access.server";

const httpsUrl=z.string().url().max(2048).refine(value=>{
 try { const u=new URL(value); return u.protocol==="https:"&&!u.username&&!u.password; }
 catch { return false; }
},"Use an HTTPS resource link without embedded credentials.");
export const addClassSupplement = createServerFn({method:"POST"})
 .validator((value:unknown)=>z.object({
   sectionId:z.string().uuid(),
   lessonId:z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/).optional(),
   title:z.string().trim().min(3).max(200),
   kind:z.enum(["link","video","pdf","image","audio","document"]),
   url:httpsUrl,
 }).strict().parse(value))
 .handler(async({data})=>{
   const actor=await classActor();
   if(actor.role!=="teacher")throw new AuthorizationError("assigned teacher supplement");
   return db.transaction(async tx=>{
     const {section}=await authorizeClass(actor,data.sectionId,undefined,tx);
     if(section.contentStatus!=="published")
       throw new AuthorizationError("published curriculum class");
     assertPublisherLessonReference(section.curriculum,section.contentStatus,data.lessonId);
     const [program]=await tx.select({organizationId:programs.organizationId,siteId:programs.siteId})
       .from(programs).where(eq(programs.id,section.programId)).limit(1);
     if(!program||program.siteId!==section.siteId)
       throw new AuthorizationError("class organization and site");
     const [resource]=await tx.insert(curriculumResources).values({
       ownerOrganizationId:program.organizationId,
       kind:data.kind,title:data.title,url:data.url,sourceUrl:data.url,
       licenseCode:"USER-SUPPLIED",
       metadata:{source:"teacher_supplement",scope:"section",rightsReview:"teacher_responsibility",
         createdByPersonId:actor.actorPersonId},
     }).returning({id:curriculumResources.id});
     if(!resource)throw new Error("Cannot save teacher resource");
     const [supplement]=await tx.insert(curriculumOverlays).values({
       organizationId:program.organizationId,programId:section.programId,
       siteId:section.siteId,sectionId:section.id,
       courseTemplateVersionId:section.versionId,
       lessonId:data.lessonId??null,
       title:data.title,kind:data.kind,resourceId:resource.id,
       createdByPersonId:actor.actorPersonId,
       metadata:{scope:"section",source:"teacher_supplement",publisherContentModified:false},
     }).returning({id:curriculumOverlays.id});
     if(!supplement)throw new Error("Cannot attach teacher supplement");
     await writeAudit(tx,actor,{
       action:"curriculum.teacher_supplement.add",entityType:"curriculum_overlay",
       entityId:supplement.id,
       scope:{organizationId:program.organizationId,programId:section.programId,sectionId:section.id},
       after:{resourceId:resource.id,lessonId:data.lessonId??null,kind:data.kind,
         publisherCourseVersionUnchanged:section.versionId},
     });
     await emitEvent(tx,{eventType:"CurriculumSupplementAdded",aggregateType:"curriculum_overlay",
       aggregateId:supplement.id,actorPersonId:actor.actorPersonId,
       programId:section.programId,siteId:section.siteId,
       payload:{sectionId:section.id,source:"teacher_supplement"}});
     return {supplementId:supplement.id};
   });
 });

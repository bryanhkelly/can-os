import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { curriculumOverlays, curriculumResources, programs } from "@/db/schema";
import { assertPublisherLessonReference } from "@/domain/publisher-course-references";
import { AuthorizationError } from "@/domain/command-context";
import { emitEvent, writeAudit } from "@/platform/mutation";
import { authorizeClass, classActor } from "./class-access.server";

import { EventTypes } from "@/domain/event-types";
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
     await emitEvent(tx,{eventType:EventTypes.CurriculumSupplementAdded,aggregateType:"curriculum_overlay",
       aggregateId:supplement.id,actorPersonId:actor.actorPersonId,
       programId:section.programId,siteId:section.siteId,
       payload:{sectionId:section.id,source:"teacher_supplement"}});
     return {supplementId:supplement.id};
   });
 });

/** Teacher may retire or replace their own class supplements, never publisher/school records. */
export const manageClassSupplement=createServerFn({method:"POST"})
 .validator((value:unknown)=>z.discriminatedUnion("action",[
  z.object({action:z.literal("retire"),sectionId:z.string().uuid(),supplementId:z.string().uuid()}).strict(),
  z.object({action:z.literal("replace"),sectionId:z.string().uuid(),supplementId:z.string().uuid(),
   title:z.string().trim().min(3).max(200),kind:z.enum(["link","video","pdf","image","audio","document"]),
   url:httpsUrl}).strict(),
 ]).parse(value))
 .handler(async({data})=>{
  const actor=await classActor();
  if(actor.role!=="teacher"||!actor.actorPersonId)throw new AuthorizationError("assigned teacher supplement");
  return db.transaction(async tx=>{
   const {section}=await authorizeClass(actor,data.sectionId,undefined,tx);
   if(section.contentStatus!=="published")throw new AuthorizationError("published class");
   const [supplement]=await tx.select().from(curriculumOverlays)
    .where(and(eq(curriculumOverlays.id,data.supplementId),
      eq(curriculumOverlays.sectionId,section.id),
      eq(curriculumOverlays.courseTemplateVersionId,section.versionId),
      eq(curriculumOverlays.status,"active"))).for("update").limit(1);
   if(!supplement||supplement.metadata?.source!=="teacher_supplement"||
     supplement.createdByPersonId!==actor.actorPersonId)
    throw new AuthorizationError("own active teacher supplement in this class");
   const [program]=await tx.select({organizationId:programs.organizationId,siteId:programs.siteId})
    .from(programs).where(eq(programs.id,section.programId)).limit(1);
   if(!program||supplement.organizationId!==program.organizationId||
      supplement.programId!==section.programId||supplement.siteId!==section.siteId)
    throw new AuthorizationError("same school and class supplement");
   const before={resourceId:supplement.resourceId,title:supplement.title,kind:supplement.kind,status:supplement.status};
   let resourceId=supplement.resourceId;
   if(data.action==="replace"){
    const [resource]=await tx.insert(curriculumResources).values({
     ownerOrganizationId:program.organizationId,
     kind:data.kind,title:data.title,url:data.url,sourceUrl:data.url,
     licenseCode:"USER-SUPPLIED",metadata:{source:"teacher_supplement",scope:"section",
       rightsReview:"teacher_responsibility",createdByPersonId:actor.actorPersonId},
    }).returning({id:curriculumResources.id});
    if(!resource)throw new Error("Unable to save replacement resource.");
    resourceId=resource.id;
   }
   await tx.update(curriculumOverlays).set(data.action==="retire"?
    {status:"retired",updatedAt:new Date()}:
    {title:data.title,kind:data.kind,resourceId,updatedAt:new Date()})
    .where(eq(curriculumOverlays.id,supplement.id));
   await writeAudit(tx,actor,{action:`curriculum.teacher_supplement.${data.action}`,
    entityType:"curriculum_overlay",entityId:supplement.id,
    scope:{organizationId:program.organizationId,programId:section.programId,sectionId:section.id},
    before,after:{status:data.action==="retire"?"retired":"active",resourceId,
      publisherCourseVersionUnchanged:section.versionId}});
   await emitEvent(tx,{eventType:EventTypes.CurriculumSupplementChanged,aggregateType:"curriculum_overlay",
    aggregateId:supplement.id,actorPersonId:actor.actorPersonId,programId:section.programId,
    siteId:section.siteId,payload:{sectionId:section.id,action:data.action}});
   return {saved:true};
  });
 });

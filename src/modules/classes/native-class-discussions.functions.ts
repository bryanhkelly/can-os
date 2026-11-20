import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  canonicalClasses, canonicalClassEnrollments,
} from "@/db/canonical-v301";
import {
  communicationThreads, communicationMessages, communicationParticipants,
} from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { getInstructionalLearnerContext } from "@/modules/identity/learning-command-context.server";
import { authorizeCanonicalCourseAttempt } from "@/modules/learning/canonical-course-participation.server";

const site="f1000000-0000-4000-8000-000000000003";
const org="f1000000-0000-4000-8000-000000000002";
const scope=z.object({classEnrollmentId:z.string().uuid()}).strict();
const submit=scope.extend({
  threadId:z.string().uuid(),
  body:z.string().trim().min(5).max(1500),
}).strict();

function noStore(){
  setResponseHeader("Cache-Control","private, no-store");
  setResponseHeader("Referrer-Policy","no-referrer");
}

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
type Learner=Awaited<ReturnType<typeof getInstructionalLearnerContext>>;
async function requirePrivateDiscussionAccess(tx:Tx,actor:Learner,classEnrollmentId:string){
  if(!actor.actorPersonId||actor.sessionAccountId||
      actor.role!=="student"||!actor.capabilities.has("student:read")||
      !actor.scope.siteIds?.includes(site)||
      !actor.scope.organizationIds?.includes(org))
    throw new AuthorizationError("direct CAN student membership");
  const [enrollment]=await tx.select().from(canonicalClassEnrollments).where(and(
    eq(canonicalClassEnrollments.id,classEnrollmentId),
    eq(canonicalClassEnrollments.learnerPersonId,actor.actorPersonId),
    eq(canonicalClassEnrollments.status,"active"))).limit(1);
  if(!enrollment?.courseAttemptId)throw new AuthorizationError("current Class Course Attempt");
  const [cls]=await tx.select().from(canonicalClasses)
    .where(eq(canonicalClasses.id,enrollment.classId)).limit(1);
  if(!cls||cls.siteId!==site||cls.operatingOrganizationId!==org||cls.state!=="active")
    throw new AuthorizationError("your active Valor Class");
  const access=await authorizeCanonicalCourseAttempt(tx,actor,enrollment.courseAttemptId);
  if(access.source!=="class"||access.courseVersionId!==cls.courseVersionId)
    throw new AuthorizationError("your Class Course Attempt");
  const threads=await tx.select({
    id:communicationThreads.id,subject:communicationThreads.subject,
  }).from(communicationThreads)
    .innerJoin(communicationParticipants,and(
      eq(communicationParticipants.threadId,communicationThreads.id),
      eq(communicationParticipants.participantType,"person"),
      eq(communicationParticipants.participantId,actor.actorPersonId)))
    .where(and(eq(communicationThreads.contextType,"class"),
      eq(communicationThreads.contextId,cls.id),
      sql`${communicationThreads.metadata} @> '{"fixture":"valor-v61-class-discussions","synthetic":true,"demoOnly":true,"notPublic":true}'::jsonb`))
    .limit(20);
  // Only explicitly private synthetic threads with this Person as an
  // immutable participant qualify; no schoolwide broadcast authorization.
  return {cls,threads};
}

export const getNativeClassDiscussions=createServerFn({method:"GET"})
  .validator((raw:unknown)=>scope.parse(raw))
  .handler(async({data})=>{
    noStore();
    const actor=await getInstructionalLearnerContext(getRequest());
    return db.transaction(async tx=>{
      const {cls,threads}=await requirePrivateDiscussionAccess(
        tx,actor,data.classEnrollmentId);
      if(!threads.length)return {classId:cls.id,threads:[]};
      const rows=await tx.select({
        id:communicationMessages.id,threadId:communicationMessages.threadId,
        senderPersonId:communicationMessages.senderPersonId,
        body:communicationMessages.body,sentAt:communicationMessages.sentAt,
      }).from(communicationMessages)
        .where(inArray(communicationMessages.threadId,threads.map(t=>t.id)))
        .orderBy(asc(communicationMessages.sentAt)).limit(150);
      return {classId:cls.id,threads:threads.map(t=>({
        id:t.id,subject:t.subject,
        messages:rows.filter(row=>row.threadId===t.id).map(row=>({
          id:row.id,body:row.body,sentAt:row.sentAt.toISOString(),
          senderLabel:row.senderPersonId===actor.actorPersonId?"You":"Instructor",
        })),
      }))};
    });
  });

/** Student messages stay in a private teacher-student demo thread. They are
 * never treated as classwide announcements or pushed to external providers. */
export const submitNativeClassDiscussionMessage=createServerFn({method:"POST"})
  .validator((raw:unknown)=>submit.parse(raw))
  .handler(async({data})=>{
    noStore();
    const actor=await getInstructionalLearnerContext(getRequest());
    if(!actor.actorPersonId||!actor.capabilities.has("student:read"))
      throw new AuthorizationError("own Class discussion permission");
    return db.transaction(async tx=>{
      const {threads}=await requirePrivateDiscussionAccess(tx,actor,data.classEnrollmentId);
      if(!threads.some(t=>t.id===data.threadId))throw new AuthorizationError("own private Class thread");
      const [row]=await tx.insert(communicationMessages).values({
        threadId:data.threadId,
        senderPersonId:actor.actorPersonId!,
        body:data.body,
        metadata:{synthetic:true,noExternalDelivery:true,
          demoOnly:true,origin:"native-valor-private-class-discussion"},
      }).returning({id:communicationMessages.id});
      if(!row)throw new Error("Discussion message not saved");
      return {messageId:row.id};
    });
  });

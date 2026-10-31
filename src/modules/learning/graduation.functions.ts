import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { adjudicateGraduation } from "@/domain/graduation-adjudication";
import { auditGraduationCredits, type CreditEvidence, type CreditRequirement } from "@/domain/graduation-credit-audit";
import { writeAudit } from "@/platform/mutation";

const uuid = z.string().uuid();
const rules = z.array(z.object({ subject: z.string().trim().min(1), minimumUnits: z.number().positive().finite() })).min(1);
async function resources() {
  const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
  return { db, s };
}
async function registrar() {
  const context = await getCommandContext(getRequest());
  assertCapability(context, "enrollment:manage");
  if (context.role !== "registrar" || !context.actorPersonId) throw new AuthorizationError("institutional registrar required");
  return context;
}
function issuerAuthorized(context: Awaited<ReturnType<typeof registrar>>, issuerId: string) {
  if (!context.scope.organizationIds?.includes(issuerId)) throw new AuthorizationError("credit issuing organization");
}
type SnapshotRow = {sectionId:string;subject:string;creditsEarned:number|null;terminalPeriod:boolean;letterGrade:string|null};
function evidenceFromSnapshot(snapshot: Record<string, unknown>, issuerId: string): CreditEvidence[] {
  if (!Array.isArray(snapshot.rows) || !snapshot.rows.length) throw new Error("Issued transcript has no academic evidence");
  const rows = snapshot.rows as Array<SnapshotRow & {creditIssuingOrganizationId:string}>;
  if (rows.some(row => row.creditIssuingOrganizationId !== issuerId)) throw new AuthorizationError("transcript issuer mismatch");
  // Intermediate grading periods must not count twice. A W is zero earned credit.
  return rows.filter(row => row.terminalPeriod).map(row => ({
    sectionId: row.sectionId,
    subject: row.subject,
    earnedUnits: row.creditsEarned,
    finalized: Boolean(row.sectionId && row.letterGrade),
    acceptedByIssuer: true,
  }));
}
async function transcriptAndRules(db: Awaited<ReturnType<typeof resources>>["db"], s: Awaited<ReturnType<typeof resources>>["s"], transcriptId: string, requirementSetId: string) {
  const [transcript] = await db.select().from(s.transcriptIssuances).where(eq(s.transcriptIssuances.id,transcriptId)).limit(1);
  const [requirementSet] = await db.select().from(s.graduationRequirementSets).where(eq(s.graduationRequirementSets.id,requirementSetId)).limit(1);
  if (!transcript || !requirementSet || transcript.issuingOrganizationId !== requirementSet.issuingOrganizationId)
    throw new AuthorizationError("matched transcript and approved requirements");
  return { transcript, requirementSet, evidence: evidenceFromSnapshot(transcript.snapshot, transcript.issuingOrganizationId) };
}

export const approveGraduationRequirements = createServerFn({method:"POST"})
 .validator((input:unknown) => z.object({issuerId:uuid,academicYear:z.string().min(4).max(40),version:z.string().min(1).max(40),requirements:rules}).parse(input))
 .handler(async ({data}) => {
   const context = await registrar(); issuerAuthorized(context,data.issuerId);
   const checked = auditGraduationCredits(data.requirements,[]);
   if (checked.blockers.some(b=>b.includes("requirement"))) throw new Error(checked.blockers.join("; "));
   const {db,s}=await resources();
   return db.transaction(async tx => {
     const [row]=await tx.insert(s.graduationRequirementSets).values({
       issuingOrganizationId:data.issuerId,academicYear:data.academicYear,version:data.version,
       requirements:data.requirements,approvedByPersonId:context.actorPersonId!,
     }).returning({id:s.graduationRequirementSets.id});
     await writeAudit(tx,{actorPersonId:context.actorPersonId!,action:"graduation.requirements.approve",resourceType:"graduation_requirement_set",resourceId:row!.id,scope:{organizationId:data.issuerId},after:data,context:{requestId:context.requestId??null}});
     return {requirementSetId:row!.id};
   });
 });

export const listGraduationRequirements = createServerFn({method:"GET"})
 .validator((input:unknown) => z.object({issuerId:uuid}).parse(input))
 .handler(async ({data}) => {
   setResponseHeader("Cache-Control","private, no-store");
   const context=await registrar();issuerAuthorized(context,data.issuerId);
   const {db,s}=await resources();
   return db.select().from(s.graduationRequirementSets).where(eq(s.graduationRequirementSets.issuingOrganizationId,data.issuerId)).orderBy(desc(s.graduationRequirementSets.approvedAt));
 });

export const auditIssuedTranscript = createServerFn({method:"GET"})
 .validator((input:unknown) => z.object({transcriptId:uuid,requirementSetId:uuid}).parse(input))
 .handler(async ({data}) => {
   setResponseHeader("Cache-Control","private, no-store");
   const context=await registrar();const {db,s}=await resources();
   const {transcript,requirementSet,evidence}=await transcriptAndRules(db,s,data.transcriptId,data.requirementSetId);
   issuerAuthorized(context,transcript.issuingOrganizationId);
   return {studentProfileId:transcript.studentProfileId,audit:auditGraduationCredits(requirementSet.requirements as CreditRequirement[],evidence)};
 });

export const decideGraduation = createServerFn({method:"POST"})
 .validator((input:unknown) => z.object({transcriptId:uuid,requirementSetId:uuid,decision:z.enum(["approved","denied"])}).parse(input))
 .handler(async ({data}) => {
   const context=await registrar();const {db,s}=await resources();
   return db.transaction(async tx => {
     const {transcript,requirementSet,evidence}=await transcriptAndRules(tx as typeof db,s,data.transcriptId,data.requirementSetId);
     issuerAuthorized(context,transcript.issuingOrganizationId);
     const result=adjudicateGraduation({
       requirementSetId:requirementSet.id,transcriptIssuanceId:transcript.id,
       requirementIssuerId:requirementSet.issuingOrganizationId,transcriptIssuerId:transcript.issuingOrganizationId,
       studentProfileId:transcript.studentProfileId,transcriptStudentProfileId:transcript.studentProfileId,
       requirements:requirementSet.requirements as CreditRequirement[],evidence,decision:data.decision,
     });
     const [row]=await tx.insert(s.graduationDecisions).values({
       studentProfileId:transcript.studentProfileId,issuingOrganizationId:transcript.issuingOrganizationId,
       requirementSetId:requirementSet.id,transcriptIssuanceId:transcript.id,decision:result.decision,
       audit:result.audit,decidedByPersonId:context.actorPersonId!,
     }).returning({id:s.graduationDecisions.id});
     await writeAudit(tx,{actorPersonId:context.actorPersonId!,action:"graduation.decide",resourceType:"graduation_decision",resourceId:row!.id,scope:{organizationId:transcript.issuingOrganizationId},after:{decision:data.decision,audit:result.audit},context:{requestId:context.requestId??null}});
     return {decisionId:row!.id,audit:result.audit};
   });
 });

export const issueDiploma = createServerFn({method:"POST"})
 .validator((input:unknown) => z.object({decisionId:uuid}).parse(input))
 .handler(async ({data}) => {
   const context=await registrar();const {db,s}=await resources();
   return db.transaction(async tx => {
     const [decision]=await tx.select().from(s.graduationDecisions).where(eq(s.graduationDecisions.id,data.decisionId)).limit(1);
     if (!decision || decision.decision!=="approved") throw new AuthorizationError("approved graduation decision required");
     issuerAuthorized(context,decision.issuingOrganizationId);
     const [prior]=await tx.select({id:s.graduationDecisions.id}).from(s.graduationDecisions)
       .where(and(eq(s.graduationDecisions.studentProfileId,decision.studentProfileId),eq(s.graduationDecisions.issuingOrganizationId,decision.issuingOrganizationId)))
       .orderBy(desc(s.graduationDecisions.decidedAt)).limit(1);
     if(prior?.id!==decision.id) throw new Error("Graduation decision was superseded");
     const [diploma]=await tx.insert(s.diplomaIssuances).values({graduationDecisionId:decision.id,issuedByPersonId:context.actorPersonId!}).onConflictDoNothing().returning({id:s.diplomaIssuances.id});
     if(!diploma) throw new Error("Diploma already issued for this decision");
     await writeAudit(tx,{actorPersonId:context.actorPersonId!,action:"diploma.issue",resourceType:"diploma_issuance",resourceId:diploma.id,scope:{organizationId:decision.issuingOrganizationId},after:{decisionId:decision.id},context:{requestId:context.requestId??null}});
     return {diplomaId:diploma.id};
   });
 });

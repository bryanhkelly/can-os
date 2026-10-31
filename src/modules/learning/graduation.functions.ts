import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { resolveGraduationPolicy } from "@/domain/graduation-policy";
import { adjudicateGraduation } from "@/domain/graduation-adjudication";
import { auditGraduationCredits, type CreditEvidence, type CreditRequirement } from "@/domain/graduation-credit-audit";
import { writeAudit } from "@/platform/mutation";

const uuid = z.string().uuid();
const rules = z.array(z.object({ subject: z.string().trim().min(1), minimumUnits: z.number().positive().finite() })).min(1).refine(rows=>new Set(rows.map(row=>row.subject.toLocaleLowerCase())).size===rows.length,"Duplicate graduation subjects are not allowed");
async function resources() {
  const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
  return { db, s };
}
async function registrar() {
  const context = await getCommandContext(getRequest());
  assertCapability(context, "enrollment:manage");
  if (context.role !== "registrar" || !context.actorPersonId || context.demoFacilitator) throw new AuthorizationError("verified institutional registrar required");
  return context;
}
function issuerAuthorized(context: Awaited<ReturnType<typeof registrar>>, issuerId: string) {
  if (!context.scope.organizationIds?.includes(issuerId)) throw new AuthorizationError("credit issuing organization");
}
type SnapshotRow = {sectionId:string;subject:string;creditsEarned:number|null;terminalPeriod:boolean;letterGrade:string|null;isTransferCredit?:boolean;acceptedByIssuer?:boolean;creditAcceptanceStatus?:string};
function evidenceFromSnapshot(snapshot: Record<string, unknown>, issuerId: string): CreditEvidence[] {
  if (!Array.isArray(snapshot.rows) || !snapshot.rows.length) throw new Error("Issued transcript has no academic evidence");
  const rows = snapshot.rows as Array<SnapshotRow & {creditIssuingOrganizationId:string}>;
  if (rows.some(row => row.creditIssuingOrganizationId !== issuerId)) throw new AuthorizationError("transcript issuer mismatch");
  // Intermediate grading periods must not count twice. A W is zero earned credit.
  const terminal = rows.filter(row => row.terminalPeriod);
  const sections = new Map<string, typeof terminal[number]>();
  for (const row of terminal) {
    if (!row.sectionId || sections.has(row.sectionId)) throw new Error("Duplicate or missing terminal section evidence");
    sections.set(row.sectionId,row);
  }
  return [...sections.values()].map(row => ({
    sectionId: row.sectionId,
    subject: row.subject,
    earnedUnits: row.creditsEarned,
    finalized: Boolean(row.sectionId && row.letterGrade),
    // Transfer evidence must carry affirmative issuer acceptance.
    // A snapshot without acceptance cannot confer graduation credit.
    acceptedByIssuer: row.isTransferCredit === true ? row.acceptedByIssuer === true && row.creditAcceptanceStatus === "accepted" : true,
  }));
}
/** Check current canonical enrollment custody, not only the immutable transcript snapshot. */
async function assertNoWithdrawnTranscriptCredits(db:Pick<Awaited<ReturnType<typeof resources>>["db"],"select">,
 s:Awaited<ReturnType<typeof resources>>["s"],studentProfileId:string,evidence:readonly CreditEvidence[]){
 const sectionIds=evidence.filter(row=>row.earnedUnits!==null && row.earnedUnits>0).map(row=>row.sectionId);
 if(!sectionIds.length)return;
 const withdrawn=await db.select({sectionId:s.enrollments.sectionId}).from(s.enrollments)
   .where(and(eq(s.enrollments.studentProfileId,studentProfileId),eq(s.enrollments.kind,"section"),
     eq(s.enrollments.status,"withdrawn"),inArray(s.enrollments.sectionId,sectionIds)));
 if(withdrawn.length)throw new AuthorizationError("Previously earned transcript credit has a current withdrawn enrollment; reissue and review the transcript");
}

async function transcriptAndRules(db: Pick<Awaited<ReturnType<typeof resources>>["db"], "select">, s: Awaited<ReturnType<typeof resources>>["s"], transcriptId: string, requirementSetId: string) {
  const [transcript] = await db.select().from(s.transcriptIssuances).where(eq(s.transcriptIssuances.id,transcriptId)).limit(1);
  const [requirementSet] = await db.select().from(s.graduationRequirementSets).where(eq(s.graduationRequirementSets.id,requirementSetId)).limit(1);
  if (!transcript || !requirementSet || transcript.issuingOrganizationId !== requirementSet.issuingOrganizationId)
    throw new AuthorizationError("matched transcript and approved requirements");
  // Resolve the earliest institutional program entry cohort, not the currently
  // active academic year. Transfer overrides require documented institution
  // records; undocumented overrides are deliberately not inferred.
  const enrollments = await db.select({yearId:s.schoolYears.id, yearName:s.schoolYears.name,
    yearKey:s.schoolYears.key, yearStarts:s.schoolYears.startsOn,
    issuer:s.programs.creditIssuingOrganizationId, startedAt:s.enrollments.startedAt,
    metadata:s.enrollments.metadata})
    .from(s.enrollments)
    .innerJoin(s.schoolYears,eq(s.schoolYears.id,s.enrollments.schoolYearId))
    .innerJoin(s.programs,eq(s.programs.id,s.enrollments.programId))
    .where(and(eq(s.enrollments.studentProfileId,transcript.studentProfileId),
      eq(s.enrollments.kind,"program"),inArray(s.enrollments.status,["active","graduated","transferred","withdrawn"])));
  const institutional=enrollments.filter(row=>row.issuer===transcript.issuingOrganizationId)
    .sort((x,y)=>String(x.yearStarts).localeCompare(String(y.yearStarts)));
  if(!institutional.length) throw new AuthorizationError("Institutional entry cohort not established");
  const documented=institutional.map(row=>row.metadata?.graduationEntryCohort).filter(value=>value!==undefined && value!==null);
  if(documented.some(v=>typeof v!=="string" || !/^[0-9]{4}$/.test(v)) || new Set(documented).size>1)
    throw new AuthorizationError("Conflicting documented graduation cohort overrides");
  // The earliest issuing-institution program year is the entry cohort.
  // A registrar-recorded override is authoritative only when consistent across records.
  if(documented.length){
    const evidence=institutional.find(row=>row.metadata?.graduationEntryCohort===documented[0]);
    const metadata=evidence?.metadata;
    if(institutional.some(row=>row.metadata?.graduationEntryCohort!==undefined && row.metadata?.graduationEntryCohort!==documented[0]) ||
       metadata?.graduationEntryCohortReason!=="transfer" ||
       typeof metadata.graduationEntryCohortEvidenceReference!=="string" ||
       metadata.graduationEntryCohortEvidenceReference.trim().length<12 ||
       typeof metadata.graduationEntryCohortConsentReference!=="string" ||
       metadata.graduationEntryCohortConsentReference.trim().length<12 ||
       typeof metadata.graduationEntryCohortApprovedByPersonId!=="string" ||
       !uuid.safeParse(metadata.graduationEntryCohortApprovedByPersonId).success)
      throw new AuthorizationError("Documented transfer cohort override lacks registrar approval, consent or evidence");
  }
  const entryCohort=(documented[0] as string|undefined) ?? String(institutional[0]!.yearStarts).slice(0,4);
  const policies=await db.select().from(s.graduationRequirementSets)
    .where(eq(s.graduationRequirementSets.issuingOrganizationId,transcript.issuingOrganizationId));
  let applicable;
  try { applicable=resolveGraduationPolicy(policies,entryCohort); }
  catch { throw new AuthorizationError("No unambiguous applicable graduation cohort policy"); }
  if(applicable.id!==requirementSet.id)
    throw new AuthorizationError("Selected graduation policy does not apply to student cohort");
  if(institutional[0] && new Date(String(institutional[0].yearStarts)).getTime()>transcript.issuedAt.getTime())
    throw new AuthorizationError("Transcript predates institutional enrollment");
  const evidence=evidenceFromSnapshot(transcript.snapshot,transcript.issuingOrganizationId);
  await assertNoWithdrawnTranscriptCredits(db,s,transcript.studentProfileId,evidence);
  return { transcript, requirementSet, evidence };
}

export const approveGraduationRequirements = createServerFn({method:"POST"})
 .validator((input:unknown) => z.object({issuerId:uuid,academicYear:z.string().min(4).max(40),version:z.string().min(1).max(40),cohortStart:z.string().regex(/^[0-9]{4}$/),cohortEnd:z.string().regex(/^[0-9]{4}$/),supersedesRequirementSetId:uuid.optional(),applicabilityReason:z.string().trim().min(12).max(1000),requirements:rules}).parse(input))
 .handler(async ({data}) => {
   const context = await registrar(); issuerAuthorized(context,data.issuerId);
   const checked = auditGraduationCredits(data.requirements,[]);
   if (checked.blockers.some(b=>b.includes("requirement"))) throw new Error(checked.blockers.join("; "));
   const {db,s}=await resources();
   return db.transaction(async tx => {
     // Serialize policy approvals for an issuer/year to prevent competing active
     // versions that cannot yet be assigned to an individual cohort.
     const {sql}=await import("drizzle-orm");
     await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${data.issuerId + ":graduation-policy"}))`);
     if(data.cohortStart>data.cohortEnd) throw new AuthorizationError("Invalid cohort window");
     const policies=await tx.select().from(s.graduationRequirementSets)
       .where(eq(s.graduationRequirementSets.issuingOrganizationId,data.issuerId));
     if(data.supersedesRequirementSetId){
       const prior=policies.find(p=>p.id===data.supersedesRequirementSetId);
       if(!prior)throw new AuthorizationError("Superseded policy must belong to issuer");
       if(policies.some(p=>p.supersedesRequirementSetId===prior.id))throw new AuthorizationError("Policy version already superseded");
       if(prior.cohortStart!==data.cohortStart || prior.cohortEnd!==data.cohortEnd)
         throw new AuthorizationError("Policy revision must retain cohort bounds");
     }
     const active=policies.filter(p=>!policies.some(next=>next.supersedesRequirementSetId===p.id) && p.id!==data.supersedesRequirementSetId);
     if(active.some(p=>!p.cohortStart || !p.cohortEnd || p.cohortStart<=data.cohortEnd && p.cohortEnd>=data.cohortStart))
       throw new AuthorizationError("Overlapping or unclassified approved cohort policy");
     const [row]=await tx.insert(s.graduationRequirementSets).values({
       issuingOrganizationId:data.issuerId,academicYear:data.academicYear,version:data.version,
       cohortStart:data.cohortStart,cohortEnd:data.cohortEnd,
       supersedesRequirementSetId:data.supersedesRequirementSetId??null,applicabilityReason:data.applicabilityReason,
       requirements:data.requirements,approvedByPersonId:context.actorPersonId!,
     }).returning({id:s.graduationRequirementSets.id});
     await writeAudit(tx,{actorPersonId:context.actorPersonId!,action:"graduation.requirements.approve",resourceType:"graduation_requirement_set",resourceId:row!.id,scope:{organizationId:data.issuerId},after:data,context:{requestId:context.requestId??null}});
     return {requirementSetId:row!.id};
   });
 });

/** Return only institutions the authenticated registrar can administer. */
export const listGraduationIssuers=createServerFn({method:"GET"})
 .handler(async()=>{
   setResponseHeader("Cache-Control","private, no-store");
   const context=await registrar();const {db,s}=await resources();
   const {inArray}=await import("drizzle-orm");
   const ids=context.scope.organizationIds??[];
   if(!ids.length)return [];
   return db.select({id:s.organizations.id,name:s.organizations.name})
     .from(s.organizations).where(inArray(s.organizations.id,ids))
     .orderBy(s.organizations.name);
 });

export const listGraduationRequirements = createServerFn({method:"GET"})
 .validator((input:unknown) => z.object({issuerId:uuid}).parse(input))
 .handler(async ({data}) => {
   setResponseHeader("Cache-Control","private, no-store");
   const context=await registrar();issuerAuthorized(context,data.issuerId);
   const {db,s}=await resources();
   return db.select().from(s.graduationRequirementSets).where(eq(s.graduationRequirementSets.issuingOrganizationId,data.issuerId)).orderBy(desc(s.graduationRequirementSets.approvedAt));
 });

/** Student-centered registrar choices: only institution-scoped issued records.
 * IDs stay server-owned and are returned only as opaque options. */
export const listGraduationCandidates=createServerFn({method:"GET"})
 .validator((value:unknown)=>z.object({query:z.string().trim().min(2).max(100)}).parse(value))
 .handler(async ({data})=>{
  setResponseHeader("Cache-Control","private, no-store");
  const context=await registrar();const {db,s}=await resources();
  const {ilike,or}=await import("drizzle-orm");
  const issuerIds=context.scope.organizationIds??[];
  if(!issuerIds.length)return [];
  const {inArray}=await import("drizzle-orm");
  return db.select({transcriptId:s.transcriptIssuances.id,
    studentProfileId:s.studentProfiles.id,issuerId:s.transcriptIssuances.issuingOrganizationId,
    firstName:s.people.legalFirstName,lastName:s.people.legalLastName,
    issuedAt:s.transcriptIssuances.issuedAt})
   .from(s.transcriptIssuances)
   .innerJoin(s.studentProfiles,eq(s.studentProfiles.id,s.transcriptIssuances.studentProfileId))
   .innerJoin(s.people,eq(s.people.id,s.studentProfiles.personId))
   .where(and(inArray(s.transcriptIssuances.issuingOrganizationId,issuerIds),
     or(ilike(s.people.legalFirstName,"%"+data.query+"%"),ilike(s.people.legalLastName,"%"+data.query+"%"))))
   .orderBy(desc(s.transcriptIssuances.issuedAt)).limit(40);
 });

/** Server-owned applicable policy lookup; UI never chooses arbitrary requirement IDs. */
export const getApplicableGraduationPolicy=createServerFn({method:"GET"})
 .validator((input:unknown)=>z.object({transcriptId:uuid}).parse(input))
 .handler(async ({data})=>{
   setResponseHeader("Cache-Control","private, no-store");
   const context=await registrar();const {db,s}=await resources();
   const [transcript]=await db.select().from(s.transcriptIssuances)
     .where(eq(s.transcriptIssuances.id,data.transcriptId)).limit(1);
   if(!transcript)throw new AuthorizationError("Transcript not found");
   issuerAuthorized(context,transcript.issuingOrganizationId);
   const policies=await db.select().from(s.graduationRequirementSets)
     .where(eq(s.graduationRequirementSets.issuingOrganizationId,transcript.issuingOrganizationId));
   const matches=[];
   for(const policy of policies){
     try{await transcriptAndRules(db,s,transcript.id,policy.id);matches.push(policy);}
     catch(error){
       if(error instanceof AuthorizationError && error.message==="Selected graduation policy does not apply to student cohort")continue;
       throw error;
     }
   }
   if(matches.length!==1)throw new AuthorizationError("No unambiguous applicable policy");
   return {id:matches[0]!.id,academicYear:matches[0]!.academicYear,version:matches[0]!.version,
     cohortStart:matches[0]!.cohortStart,cohortEnd:matches[0]!.cohortEnd};
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
 .validator((input:unknown) => z.object({transcriptId:uuid,requirementSetId:uuid,decision:z.enum(["approved","denied"]),rationale:z.string().trim().min(12).max(2000)}).parse(input))
 .handler(async ({data}) => {
   const context=await registrar();const {db,s}=await resources();
   return db.transaction(async tx => {
     const {transcript,requirementSet,evidence}=await transcriptAndRules(tx,s,data.transcriptId,data.requirementSetId);
     issuerAuthorized(context,transcript.issuingOrganizationId);
     const {sql}=await import("drizzle-orm");
     await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${transcript.studentProfileId + ":" + transcript.issuingOrganizationId + ":graduation"}))`);
     if(data.decision==="approved") {
       const [latestTranscript]=await tx.select({id:s.transcriptIssuances.id}).from(s.transcriptIssuances)
         .where(and(eq(s.transcriptIssuances.studentProfileId,transcript.studentProfileId),eq(s.transcriptIssuances.issuingOrganizationId,transcript.issuingOrganizationId)))
         .orderBy(desc(s.transcriptIssuances.issuedAt),desc(s.transcriptIssuances.id)).limit(1);
       if(latestTranscript?.id!==transcript.id) throw new AuthorizationError("Latest issued transcript required for graduation");
     }
     const [lastDecision]=await tx.select().from(s.graduationDecisions)
       .where(and(eq(s.graduationDecisions.studentProfileId,transcript.studentProfileId),eq(s.graduationDecisions.issuingOrganizationId,transcript.issuingOrganizationId)))
       .orderBy(desc(s.graduationDecisions.decidedAt),desc(s.graduationDecisions.id)).limit(1);
     if(lastDecision?.transcriptIssuanceId===transcript.id && lastDecision.requirementSetId===requirementSet.id && lastDecision.decision===data.decision)
       throw new AuthorizationError("Identical graduation decision already recorded");
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
     await writeAudit(tx,{actorPersonId:context.actorPersonId!,action:"graduation.decide",resourceType:"graduation_decision",resourceId:row!.id,scope:{organizationId:transcript.issuingOrganizationId},after:{decision:data.decision,audit:result.audit,rationale:data.rationale},context:{requestId:context.requestId??null}});
     return {decisionId:row!.id,audit:result.audit};
   });
 });

/** Institution-owned diploma status, never a release authorization. B must additionally authorize the recipient. */
/** Revocation is append-only state: a revoked diploma is never reactivated. */
export const revokeDiploma=createServerFn({method:"POST"})
 .validator((input:unknown)=>z.object({diplomaId:uuid,reason:z.string().trim().min(12).max(2000)}).parse(input))
 .handler(async ({data})=>{
   const context=await registrar();const {db,s}=await resources();
   return db.transaction(async tx=>{
     const [diploma]=await tx.select().from(s.diplomaIssuances)
       .where(eq(s.diplomaIssuances.id,data.diplomaId)).limit(1);
     if(!diploma)throw new AuthorizationError("Diploma not found");
     const [decision]=await tx.select().from(s.graduationDecisions)
       .where(eq(s.graduationDecisions.id,diploma.graduationDecisionId)).limit(1);
     if(!decision)throw new AuthorizationError("Graduation decision unavailable");
     issuerAuthorized(context,decision.issuingOrganizationId);
     if(diploma.revokedAt)throw new AuthorizationError("Diploma already revoked");
     const [updated]=await tx.update(s.diplomaIssuances)
       .set({revokedAt:new Date(),revocationReason:data.reason})
       .where(and(eq(s.diplomaIssuances.id,data.diplomaId),eq(s.diplomaIssuances.graduationDecisionId,decision.id)))
       .returning({id:s.diplomaIssuances.id});
     if(!updated)throw new AuthorizationError("Diploma was not revoked");
     await writeAudit(tx,{actorPersonId:context.actorPersonId!,action:"diploma.revoke",resourceType:"diploma_issuance",resourceId:diploma.id,
       scope:{organizationId:decision.issuingOrganizationId},after:{reason:data.reason},context:{requestId:context.requestId??null}});
     return {diplomaId:updated.id,status:"revoked" as const};
   });
 });

export const getDiplomaFreshness=createServerFn({method:"GET"})
 .validator((input:unknown)=>z.object({diplomaId:uuid}).parse(input))
 .handler(async ({data})=>{
   setResponseHeader("Cache-Control","private, no-store");
   const context=await registrar();const {db,s}=await resources();
   const [diploma]=await db.select().from(s.diplomaIssuances).where(eq(s.diplomaIssuances.id,data.diplomaId)).limit(1);
   if(!diploma)throw new AuthorizationError("Diploma not found");
   const [decision]=await db.select().from(s.graduationDecisions).where(eq(s.graduationDecisions.id,diploma.graduationDecisionId)).limit(1);
   if(!decision)throw new AuthorizationError("Graduation decision unavailable");
   issuerAuthorized(context,decision.issuingOrganizationId);
   if(diploma.revokedAt) return {diplomaId:diploma.id,status:"revoked" as const};
   const [latest]=await db.select({id:s.graduationDecisions.id}).from(s.graduationDecisions)
     .where(and(eq(s.graduationDecisions.studentProfileId,decision.studentProfileId),eq(s.graduationDecisions.issuingOrganizationId,decision.issuingOrganizationId)))
     .orderBy(desc(s.graduationDecisions.decidedAt),desc(s.graduationDecisions.id)).limit(1);
   if(latest?.id!==decision.id || decision.decision!=="approved")return {diplomaId:diploma.id,status:"review_required" as const};
   try {
     const current=await transcriptAndRules(db,s,decision.transcriptIssuanceId,decision.requirementSetId);
     const [newest]=await db.select({id:s.transcriptIssuances.id}).from(s.transcriptIssuances)
       .where(and(eq(s.transcriptIssuances.studentProfileId,decision.studentProfileId),eq(s.transcriptIssuances.issuingOrganizationId,decision.issuingOrganizationId)))
       .orderBy(desc(s.transcriptIssuances.issuedAt),desc(s.transcriptIssuances.id)).limit(1);
     const audit=auditGraduationCredits(current.requirementSet.requirements as CreditRequirement[],current.evidence);
     if(newest?.id!==decision.transcriptIssuanceId || audit.status!=="requirements_met" || JSON.stringify(audit)!==JSON.stringify(decision.audit))
       return {diplomaId:diploma.id,status:"review_required" as const};
   }catch{return {diplomaId:diploma.id,status:"review_required" as const};}
   return {diplomaId:diploma.id,status:"current" as const};
 });

export const issueDiploma = createServerFn({method:"POST"})
 .validator((input:unknown) => z.object({decisionId:uuid}).parse(input))
 .handler(async ({data}) => {
   const context=await registrar();const {db,s}=await resources();
   return db.transaction(async tx => {
     const [decision]=await tx.select().from(s.graduationDecisions).where(eq(s.graduationDecisions.id,data.decisionId)).limit(1);
     if (!decision || decision.decision!=="approved") throw new AuthorizationError("approved graduation decision required");
     issuerAuthorized(context,decision.issuingOrganizationId);
     // Lock the student/issuer decision stream: a later adjudication cannot
     // race with diploma issuance. A subsequent decision supersedes this one.
     const {sql}=await import("drizzle-orm");
     await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${decision.studentProfileId + ":" + decision.issuingOrganizationId + ":graduation"}))`);
     const [prior]=await tx.select({id:s.graduationDecisions.id}).from(s.graduationDecisions)
       .where(and(eq(s.graduationDecisions.studentProfileId,decision.studentProfileId),eq(s.graduationDecisions.issuingOrganizationId,decision.issuingOrganizationId)))
       .orderBy(desc(s.graduationDecisions.decidedAt),desc(s.graduationDecisions.createdAt),desc(s.graduationDecisions.id)).limit(1);
     if(prior?.id!==decision.id) throw new Error("Graduation decision was superseded");
     // Re-resolve the applicable institution policy and re-audit immutable
     // transcript evidence before issuing. Policy changes must fail closed.
     const current=await transcriptAndRules(tx,s,decision.transcriptIssuanceId,decision.requirementSetId);
     if(current.transcript.studentProfileId!==decision.studentProfileId || current.transcript.issuingOrganizationId!==decision.issuingOrganizationId)
       throw new AuthorizationError("Graduation decision evidence mismatch");
     const [latestTranscript]=await tx.select({id:s.transcriptIssuances.id}).from(s.transcriptIssuances)
       .where(and(eq(s.transcriptIssuances.studentProfileId,decision.studentProfileId),eq(s.transcriptIssuances.issuingOrganizationId,decision.issuingOrganizationId)))
       .orderBy(desc(s.transcriptIssuances.issuedAt),desc(s.transcriptIssuances.id)).limit(1);
     if(latestTranscript?.id!==decision.transcriptIssuanceId) throw new Error("Graduation decision transcript was superseded");
     const fresh=auditGraduationCredits(current.requirementSet.requirements as CreditRequirement[],current.evidence);
     if(fresh.status!=="requirements_met" || JSON.stringify(fresh)!==JSON.stringify(decision.audit))
       throw new Error("Graduation decision no longer matches eligible evidence");
     const [diploma]=await tx.insert(s.diplomaIssuances).values({graduationDecisionId:decision.id,issuedByPersonId:context.actorPersonId!}).onConflictDoNothing().returning({id:s.diplomaIssuances.id});
     if(!diploma) throw new Error("Diploma already issued for this decision");
     await writeAudit(tx,{actorPersonId:context.actorPersonId!,action:"diploma.issue",resourceType:"diploma_issuance",resourceId:diploma.id,scope:{organizationId:decision.issuingOrganizationId},after:{decisionId:decision.id},context:{requestId:context.requestId??null}});
     return {diplomaId:diploma.id};
   });
 });

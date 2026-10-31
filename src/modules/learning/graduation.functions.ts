import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { getCommandContext } from "@/modules/identity/command-context.server";
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
  // Validate untrusted historical JSON before accessing any row properties.
  if (rows.some(row => !row || typeof row !== "object" || typeof row.sectionId !== "string" || typeof row.subject !== "string" || typeof row.terminalPeriod !== "boolean" || (row.creditsEarned !== null && (typeof row.creditsEarned !== "number" || !Number.isFinite(row.creditsEarned))) || (row.letterGrade !== null && typeof row.letterGrade !== "string") || typeof row.creditIssuingOrganizationId !== "string"))
    throw new AuthorizationError("Malformed transcript credit evidence");
  if (rows.some(row => row.creditIssuingOrganizationId !== issuerId)) throw new AuthorizationError("transcript issuer mismatch");
  // Transfer acceptance must originate from the canonical issuer ledger, not JSON flags.
  if (rows.some(row => row.isTransferCredit === true || row.acceptedByIssuer !== undefined || row.creditAcceptanceStatus !== undefined))
    throw new AuthorizationError("Transfer credit requires canonical issuer-accepted ledger evidence");
  // Intermediate grading periods must not count twice. A W is zero earned credit.
  const terminal = rows.filter(row => row.terminalPeriod);
  const sections = new Map<string, typeof terminal[number]>();
  for (const row of terminal) {
    if (!row.sectionId || sections.has(row.sectionId)) throw new Error("Duplicate or missing terminal section evidence");
    sections.set(row.sectionId,row);
  }
  if([...sections.values()].some(row=>row.letterGrade?.trim().toUpperCase()==="W" && (row.creditsEarned??0)>0))
    throw new AuthorizationError("Withdrawn terminal grade cannot confer graduation credit");
  return [...sections.values()].map(row => ({
    sectionId: row.sectionId,
    subject: row.subject,
    earnedUnits: row.creditsEarned,
    finalized: Boolean(row.sectionId && row.letterGrade),
    // Issuer-matched canonical Section credit only; transfer flags were rejected above.
    acceptedByIssuer: true,
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
  // A requirements version is applicable only if it is the sole approved
  // version for the student's active institutional academic year. Fail closed
  // on ambiguous enrollment years or competing approved versions.
  const enrollments = await db.select({yearId:s.schoolYears.id, yearName:s.schoolYears.name,
    yearKey:s.schoolYears.key, yearStarts:s.schoolYears.startsOn,
    yearEnds:s.schoolYears.endsOn, issuer:s.programs.creditIssuingOrganizationId})
    .from(s.enrollments)
    .innerJoin(s.schoolYears,eq(s.schoolYears.id,s.enrollments.schoolYearId))
    .innerJoin(s.programs,eq(s.programs.id,s.enrollments.programId))
    .where(and(eq(s.enrollments.studentProfileId,transcript.studentProfileId),
      eq(s.enrollments.kind,"program"),inArray(s.enrollments.status,["active","graduated"])));
  // Unrelated host programs must not disqualify an institutional graduate.
  // Applicability is evaluated against the transcript issuing institution only.
  const matching = enrollments.filter(row=>row.issuer===transcript.issuingOrganizationId &&
    [row.yearName,row.yearKey,`${row.yearStarts.slice(0,4)}-${row.yearEnds.slice(0,4)}`].includes(requirementSet.academicYear));
  if(new Set(matching.map(row=>row.yearId)).size!==1 || !matching.length)
    throw new AuthorizationError("No unambiguous applicable graduation academic-year policy for student");
  // Historical transcript evidence must not be adjudicated against a school year
  // that starts after the immutable transcript was issued.
  if(matching[0] && new Date(matching[0].yearStarts).getTime()>transcript.issuedAt.getTime())
    throw new AuthorizationError("Transcript predates the applicable graduation school year");
  const approved = await db.select({id:s.graduationRequirementSets.id})
    .from(s.graduationRequirementSets).where(and(
      eq(s.graduationRequirementSets.issuingOrganizationId,transcript.issuingOrganizationId),
      eq(s.graduationRequirementSets.academicYear,requirementSet.academicYear)));
  if(approved.length!==1 || approved[0]?.id!==requirementSet.id)
    throw new AuthorizationError("Graduation policy is not approved for this academic year");
  const evidence = evidenceFromSnapshot(transcript.snapshot, transcript.issuingOrganizationId);
  await assertNoWithdrawnTranscriptCredits(db, s, transcript.studentProfileId, evidence);
  return { transcript, requirementSet, evidence };
}

export const approveGraduationRequirements = createServerFn({method:"POST"})
 .validator((input:unknown) => z.object({issuerId:uuid,academicYear:z.string().min(4).max(40),version:z.string().min(1).max(40),requirements:rules}).parse(input))
 .handler(async ({data}) => {
   const context = await registrar(); issuerAuthorized(context,data.issuerId);
   const checked = auditGraduationCredits(data.requirements,[]);
   if (checked.blockers.some(b=>b.includes("requirement"))) throw new Error(checked.blockers.join("; "));
   const {db,s}=await resources();
   return db.transaction(async tx => {
     // Serialize policy approvals for an issuer/year to prevent competing active
     // versions that cannot yet be assigned to an individual cohort.
     const {sql}=await import("drizzle-orm");
     await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${data.issuerId + ":" + data.academicYear}))`);
     const existing=await tx.select({id:s.graduationRequirementSets.id})
       .from(s.graduationRequirementSets)
       .where(and(eq(s.graduationRequirementSets.issuingOrganizationId,data.issuerId),eq(s.graduationRequirementSets.academicYear,data.academicYear))).limit(1);
     if(existing.length)throw new AuthorizationError("An approved graduation policy already exists for this academic year. Cohort-specific policy versioning is required before another can be approved.");
     const [row]=await tx.insert(s.graduationRequirementSets).values({
       issuingOrganizationId:data.issuerId,academicYear:data.academicYear,version:data.version,
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
     const {transcript,requirementSet,evidence}=await transcriptAndRules(tx,s,data.transcriptId,data.requirementSetId);
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

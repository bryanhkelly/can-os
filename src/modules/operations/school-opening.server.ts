import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  accessAccounts, accountPersonGrants, documents, organizations, people,
  programs, programResponsibilityAssignments, roleAssignments,
  schoolConfigurationVersions, sites,
} from "@/db/schema";
import { schoolOpeningDecisionSchema, type SchoolOpeningDecision } from "@/domain/school-opening-decision";
import type { AccessContext } from "@/domain/access-context";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { assertCANSteward } from "@/domain/network-agreement-policy";
import { emitEvent, writeAudit } from "@/platform/mutation";
import { requireChurchHostedOperatingServices } from "@/modules/programs/program-site-authorization.server";
import { activeRoleAssignmentPredicate } from "@/modules/identity/role-assignment-state.server";
import {
  schoolOpeningEvidenceCategories, schoolOpeningEvidenceLabels, schoolOpeningEvidenceNextAction,
  schoolOpeningEvidenceStatus, type SchoolOpeningEvidenceCategory,
} from "@/domain/school-opening-evidence";

import { EventTypes } from "@/domain/event-types";
export { schoolOpeningEvidenceCategories } from "@/domain/school-opening-evidence";
type Reader = Pick<typeof db,"select">;
export type ChurchSchoolIdentity = Awaited<ReturnType<typeof schoolIdentity>>;

export async function schoolIdentity(tx:Reader,programId:string){
  const [school]=await tx.select({
    programId:programs.id,programStatus:programs.status,siteId:programs.siteId,
    organizationId:programs.organizationId,
    hostId:programs.hostOrganizationId,
    institutionId:programs.academicProviderOrganizationId,
    jurisdictionId:programs.jurisdictionId,
    delivery:programs.deliveryModel,
    type:organizations.type,siteOwner:sites.organizationId,
  }).from(programs)
    .innerJoin(organizations,eq(organizations.id,programs.organizationId))
    .innerJoin(sites,eq(sites.id,programs.siteId))
    .where(eq(programs.id,programId)).limit(1);
  const siteId=school?.siteId;
  if(!school || !siteId || school.type!=="church" || !school.delivery.onsite ||
    school.institutionId===school.organizationId ||
    school.siteOwner!==school.organizationId ||
    (school.hostId && school.hostId!==school.organizationId))
    throw new AuthorizationError("independent church/CAN onsite school identity");
  const [can]=await tx.select({id:organizations.id,type:organizations.type})
    .from(organizations).where(eq(organizations.id,school.institutionId)).limit(1);
  if(can?.type!=="can_network")
    throw new AuthorizationError("existing CAN academic institution");
  return {...school,siteId};
}

export function verifyCANSchoolApprover(actor:AccessContext,institutionId:string) {
  const originalOrganizations=actor.scope.organizationIds??[];
  if(actor.demoFacilitator || originalOrganizations.length!==1 ||
     !actor.actorPersonId || actor.grantSiteId!==null ||
     !originalOrganizations.includes(institutionId))
    throw new AuthorizationError("verified independent CAN school-opening officer");
  assertCANSteward(actor,{id:institutionId,type:"can_network"},"network.agreements.verify");
}

export function verifyChurchEvidenceSubmitter(actor:AccessContext,school:ChurchSchoolIdentity) {
  if(actor.demoFacilitator || actor.role!=="registrar" || !actor.actorPersonId ||
    !actor.scope.organizationIds?.includes(school.organizationId) ||
    !actor.scope.siteIds?.includes(school.siteId) ||
    !actor.scope.programIds?.includes(school.programId))
    throw new AuthorizationError("verified church registrar for this exact Program and Site");
  assertCapability(actor,"program.launch.start");
}

export function verifySchoolOpeningReader(actor:AccessContext,school:ChurchSchoolIdentity):"host"|"can" {
  if(actor.role==="registrar") {
    verifyChurchEvidenceSubmitter(actor,school);
    return "host";
  }
  verifyCANSchoolApprover(actor,school.institutionId);
  return "can";
}

export async function latestConfiguration(tx:Reader,programId:string){
  const [configuration]=await tx.select().from(schoolConfigurationVersions)
    .where(eq(schoolConfigurationVersions.programId,programId))
    .orderBy(desc(schoolConfigurationVersions.version)).limit(1);
  if(!configuration)throw new AuthorizationError("existing configured school launch");
  return configuration;
}

/** Checks documents AND current verifiers against CAN staff membership; expiry,
 * replacement and revocation are never replaced with a stale checkbox.
 */
async function requireSchoolOpeningEvidence(tx:Reader, school:Awaited<ReturnType<typeof schoolIdentity>>,
  configurationId:string,now:Date,decisionPersonId?:string) {
  const docs=await tx.select().from(documents).where(and(
    eq(documents.subjectType,"program"),eq(documents.subjectId,school.programId),
    inArray(documents.category,[...schoolOpeningEvidenceCategories]),
  )).orderBy(desc(documents.createdAt),desc(documents.id));
  const mostRecent=new Map<string,(typeof docs)[number]>();
  for(const doc of docs)if(!mostRecent.has(doc.category))mostRecent.set(doc.category,doc);
  const latest=[...schoolOpeningEvidenceCategories].map(category=>{
    const doc=mostRecent.get(category);
    if(!doc || !doc.verifiedAt || doc.verifiedAt>now ||
       !doc.verifiedByPersonId || !doc.expiresAt || doc.expiresAt<=now ||
       (doc.metadata.reviewStatus!==undefined && doc.metadata.reviewStatus!=="approved") ||
       doc.storageProvider!=="cloudflare_r2" || doc.metadata.storageVerified!==true ||
       doc.uploadedByPersonId===doc.verifiedByPersonId ||
       (decisionPersonId && doc.verifiedByPersonId===decisionPersonId) ||
       doc.metadata.configurationId!==configurationId ||
       doc.metadata.siteId!==school.siteId ||
       doc.metadata.organizationId!==school.organizationId ||
       doc.metadata.institutionOrganizationId!==school.institutionId ||
       doc.metadata.jurisdictionId!==school.jurisdictionId)
      throw new AuthorizationError("current independently verified school opening evidence: "+category);
    return doc;
  });
  const verifiers=[...new Set(latest.map(row=>row.verifiedByPersonId!))];
  const verified=await tx.select({personId:accountPersonGrants.personId})
    .from(accountPersonGrants)
    .innerJoin(accessAccounts,eq(accessAccounts.id,accountPersonGrants.accountId))
    .innerJoin(people,eq(people.id,accountPersonGrants.personId))
    .where(and(
      inArray(accountPersonGrants.personId,verifiers),
      eq(accountPersonGrants.organizationId,school.institutionId),
      eq(accountPersonGrants.role,"can_network_steward"),
      isNull(accountPersonGrants.siteId),
      eq(accountPersonGrants.active,true),
      eq(accountPersonGrants.isSynthetic,false),
      eq(accessAccounts.disabled,false),eq(people.active,true),
      sql`${accessAccounts.emailVerifiedAt} is not null`,
    ));
  const recognized=new Set(verified.map(person=>person.personId));
  if(!verifiers.every(id=>recognized.has(id)))
    throw new AuthorizationError("independent active CAN school-opening evidence verifier");
  return latest.map(d=>({
    id:d.id,category:d.category,fileName:d.fileName,
    verifiedAt:d.verifiedAt!.toISOString(),expiresAt:d.expiresAt!.toISOString(),
  }));
}

/** Current named Site director remains mandatory even after an opening
 * decision. Revoked/expired appointments immediately invalidate new onsite
 * presence records without rewriting historic school approval.
 */
async function requireVerifiedChurchSiteDirector(
  tx:Reader,school:Awaited<ReturnType<typeof schoolIdentity>>,
  configurationId:string,now:Date,
){
  const [director]=await tx.select({id:programResponsibilityAssignments.id})
        .from(programResponsibilityAssignments)
        .innerJoin(roleAssignments,eq(roleAssignments.id,
          programResponsibilityAssignments.responsibleRoleAssignmentId))
        .innerJoin(accountPersonGrants,and(
          eq(accountPersonGrants.personId,roleAssignments.personId),
          eq(accountPersonGrants.organizationId,school.organizationId),
          eq(accountPersonGrants.siteId,school.siteId),
          eq(accountPersonGrants.role,"site_leader"),
        ))
        .innerJoin(accessAccounts,eq(accessAccounts.id,accountPersonGrants.accountId))
        .innerJoin(people,eq(people.id,roleAssignments.personId))
        .where(and(
          eq(programResponsibilityAssignments.configurationVersionId,configurationId),
          eq(programResponsibilityAssignments.responsibilityKey,"site_director"),
          eq(programResponsibilityAssignments.accountableOrganizationId,school.organizationId),
          eq(roleAssignments.organizationId,school.organizationId),
          eq(roleAssignments.siteId,school.siteId),
          eq(roleAssignments.programId,school.programId),
          eq(roleAssignments.roleKey,"site_leader"),
          sql`${roleAssignments.metadata}->>'origin' = 'local_site_delegation'`,
          activeRoleAssignmentPredicate(),
          sql`${roleAssignments.capabilities} @> ${JSON.stringify(["onsite.attendance.record"])}::jsonb`,
          eq(accountPersonGrants.active,true),
          eq(accountPersonGrants.isSynthetic,false),
          eq(accessAccounts.disabled,false),eq(people.active,true),
          sql`${accessAccounts.emailVerifiedAt} is not null`,
          sql`${programResponsibilityAssignments.effectiveFrom} <= ${now}`,
          sql`${programResponsibilityAssignments.effectiveThrough} > ${now}`,
        )).limit(1);
      if(!director)throw new AuthorizationError("active independently appointed church site director");

}

/** This does not substitute for a current signed operating agreement, staff
 * fitness, room availability or physical presence. It is a separately
 * recorded institutional approval for ONE canonical Program/configuration.
 */
export async function requireCurrentChurchSchoolOpening(
  tx:Reader,programId:string,now=new Date(),
  options:{allowPendingActivation?:boolean}={},
) {
  const school=await schoolIdentity(tx,programId);
  const configuration=await latestConfiguration(tx,programId);
  if(configuration.status!=="approved" ||
    !configuration.approvedAt || !configuration.approvedByPersonId ||
    !configuration.effectiveFrom || configuration.effectiveFrom>now ||
    configuration.approvedAt>now ||
    (school.programStatus!=="active" &&
     !(options.allowPendingActivation && school.programStatus==="launching")))
    throw new AuthorizationError("currently approved church school configuration");
  await requireChurchHostedOperatingServices(tx,programId,[
    "school_of_record","academic_instruction","onsite_supervision",
  ]);
  await requireSchoolOpeningEvidence(tx,school,configuration.id,now);
  await requireVerifiedChurchSiteDirector(tx,school,configuration.id,now);
  return {configurationId:configuration.id,version:configuration.version,
    schoolSiteId:school.siteId,hostOrganizationId:school.organizationId};
}

export async function decideChurchSchoolOpening(
  actor:AccessContext,input:SchoolOpeningDecision,
) {
  input=schoolOpeningDecisionSchema.parse(input);
  const reason=input.reason;
  return db.transaction(async tx=>{
    const [locked]=await tx.select({id:programs.id}).from(programs)
      .where(eq(programs.id,input.programId)).for("update").limit(1);
    if(!locked)throw new AuthorizationError("existing school Program");
    const school=await schoolIdentity(tx,input.programId);
    verifyCANSchoolApprover(actor,school.institutionId);
    const configuration=await latestConfiguration(tx,input.programId);
    // The Program lock serializes opening decisions; never silently retarget
    // a review of an older configuration to the latest draft.
    if(configuration.id!==input.configurationId || configuration.version!==input.expectedVersion)
      throw new Error("School configuration changed. Reload the review before recording a decision.");
    const now=new Date();
    if(input.decision==="approve"){
      if(configuration.status==="approved"&&configuration.approvedByPersonId===actor.actorPersonId)
        return {configurationId:configuration.id,status:"approved" as const};
      if(configuration.status!=="draft")
        throw new AuthorizationError("only the latest drafted school configuration can be approved");
      await requireChurchHostedOperatingServices(tx,input.programId,[
        "school_of_record","academic_instruction","onsite_supervision",
      ]);
      const evidence=(await requireSchoolOpeningEvidence(tx,school,configuration.id,now,actor.actorPersonId!)).map(doc=>doc.id);
      await requireVerifiedChurchSiteDirector(tx,school,configuration.id,now);
      await tx.update(schoolConfigurationVersions).set({
        status:"approved",approvedByPersonId:actor.actorPersonId,
        approvedAt:now,effectiveFrom:now,updatedAt:now,
      }).where(eq(schoolConfigurationVersions.id,configuration.id));
      await writeAudit(tx,actor,{
        action:"school.opening.approved",entityType:"school_configuration_version",
        entityId:configuration.id,
        scope:{organizationId:school.institutionId,siteId:school.siteId,
          programId:input.programId},
        after:{version:configuration.version,status:"approved",reason,evidence},
      });
      await emitEvent(tx,{
        eventType:EventTypes.ChurchSchoolOpeningApproved,aggregateType:"school_configuration_version",
        aggregateId:configuration.id,actorPersonId:actor.actorPersonId,
        organizationId:school.institutionId,siteId:school.siteId,programId:input.programId,
        payload:{version:configuration.version,evidence},
      });
      return {configurationId:configuration.id,status:"approved" as const};
    }
    // Emergency suspension must remain possible after a service agreement
    // expires or safeguarding evidence is withdrawn.
    if(configuration.status==="suspended")
      return {configurationId:configuration.id,status:"suspended" as const};
    if(configuration.status!=="approved")
      throw new AuthorizationError("only approved openings can be suspended");
    await tx.update(schoolConfigurationVersions).set({
      status:"suspended",updatedAt:now,
    }).where(eq(schoolConfigurationVersions.id,configuration.id));
    await writeAudit(tx,actor,{
      action:"school.opening.suspended",entityType:"school_configuration_version",
      entityId:configuration.id,
      scope:{organizationId:school.institutionId,siteId:school.siteId,
        programId:input.programId},
      before:{status:"approved"},after:{status:"suspended",reason},
    });
    await emitEvent(tx,{
      eventType:EventTypes.ChurchSchoolOpeningSuspended,aggregateType:"school_configuration_version",
      aggregateId:configuration.id,actorPersonId:actor.actorPersonId,
      organizationId:school.institutionId,siteId:school.siteId,
      programId:input.programId,payload:{reason,version:configuration.version},
    });
    return {configurationId:configuration.id,status:"suspended" as const};
  });
}

export async function readChurchSchoolOpening(actor:AccessContext,programId:string) {
  const school=await schoolIdentity(db,programId);
  const perspective=verifySchoolOpeningReader(actor,school);
  const config=await latestConfiguration(db,programId);
  const now=new Date();
  let agreementReady=false;
  let directorReady=false;
  let evidence:Awaited<ReturnType<typeof requireSchoolOpeningEvidence>>=[];
  let evidenceIssue:string|null=null;
  try{
    evidence=await requireSchoolOpeningEvidence(db,school,config.id,now,
      perspective==="can"?actor.actorPersonId!:undefined);
  }catch(error){
    if(!(error instanceof AuthorizationError))throw error;
    evidenceIssue=error.message;
  }
  try{
    await requireChurchHostedOperatingServices(db,programId,[
      "school_of_record","academic_instruction","onsite_supervision",
    ]);
    agreementReady=true;
  }catch(error){
    if(!(error instanceof AuthorizationError))throw error;
  }
  try{
    await requireVerifiedChurchSiteDirector(db,school,config.id,now);
    directorReady=true;
  }catch(error){
    if(!(error instanceof AuthorizationError))throw error;
  }
  const documentsByCategory=new Map<SchoolOpeningEvidenceCategory,(typeof documents.$inferSelect)[]>();
  const rows=await db.select().from(documents).where(and(
    eq(documents.subjectType,"program"),eq(documents.subjectId,programId),
    inArray(documents.category,[...schoolOpeningEvidenceCategories]),
  )).orderBy(desc(documents.createdAt),desc(documents.id));
  for(const document of rows) {
    const category=document.category as SchoolOpeningEvidenceCategory;
    const versions=documentsByCategory.get(category)??[];
    versions.push(document);documentsByCategory.set(category,versions);
  }
  const evidenceItems=schoolOpeningEvidenceCategories.map(category=>{
    const versions=documentsByCategory.get(category)??[];
    const latest=versions[0]??null;
    const validScope=Boolean(latest && latest.expiresAt &&
      latest.storageProvider==="cloudflare_r2" && latest.metadata.storageVerified===true &&
      latest.metadata.configurationId===config.id && latest.metadata.siteId===school.siteId &&
      latest.metadata.organizationId===school.organizationId &&
      latest.metadata.institutionOrganizationId===school.institutionId &&
      latest.metadata.jurisdictionId===school.jurisdictionId);
    const status=!latest||validScope?schoolOpeningEvidenceStatus(latest,now):"invalid";
    const responsibility=schoolOpeningEvidenceNextAction(status);
    const project=(document:(typeof rows)[number],isCurrent:boolean)=>({
      id:document.id,version:typeof document.metadata.version==="number"?document.metadata.version:1,
      fileName:document.fileName,isCurrent,status:schoolOpeningEvidenceStatus(document,now),
      submittedAt:document.createdAt.toISOString(),verifiedAt:document.verifiedAt?.toISOString()??null,
      expiresAt:document.expiresAt?.toISOString()??null,
      reviewReason:typeof document.metadata.reviewReason==="string"?document.metadata.reviewReason:null,
    });
    return {category,title:schoolOpeningEvidenceLabels[category],status,
      responsibleOwner:responsibility.owner,nextAction:responsibility.action,
      rejectionReason:latest&&status==="rejected"&&typeof latest.metadata.reviewReason==="string"
        ?latest.metadata.reviewReason:null,
      current:latest?project(latest,true):null,versions:versions.map(document=>project(document,document.id===latest?.id)),
    };
  });
  const prerequisites=[
    {id:"evidence",title:"Independent opening evidence",satisfied:evidenceIssue===null,
      detail:evidenceIssue??"All required categories have current independently verified evidence."},
    {id:"agreement",title:"CAN–church service agreement",satisfied:agreementReady,
      detail:agreementReady?"Current agreement covers the required school services."
        :"A current independently verified agreement must cover instruction, school of record and onsite supervision."},
    {id:"director",title:"Church Site director",satisfied:directorReady,
      detail:directorReady?"A current verified director is appointed to this configuration."
        :"Appoint a current verified church Site director to this configuration in Site staffing."},
  ];
  const prerequisitesReady=prerequisites.every(item=>item.satisfied);
  const evidenceReady=evidenceIssue===null&&agreementReady;
  return {
    approvalReady:perspective==="can"&&config.status==="draft"&&prerequisitesReady,prerequisites,
    programId,siteId:school.siteId,configurationId:config.id,version:config.version,
    status:config.status,evidenceReady,evidence,evidenceIssue,evidenceItems,
    canSubmit:perspective==="host"&&config.status!=="suspended",canReview:perspective==="can",
    canDecide:perspective==="can",uploadsEnabled:process.env.CAN_R2_SCHOOL_OPENING_UPLOADS_ENABLED==="true",
    evidenceRequired:[...schoolOpeningEvidenceCategories],
    approvedAt:config.approvedAt?.toISOString()??null,
  };
}

/**
 * Minimal opening-state projection for verified LOCAL onsite staff (Site
 * leaders, room facilitators and site staff running the school day). It
 * exposes only the configuration status and non-sensitive blocker
 * categories — never evidence documents, verifier identity, rejection
 * reasons or CAN review internals. A suspended or no-longer-current opening
 * must stay visible to the people physically supervising children, while
 * historical attendance and incident records remain untouched.
 */
export async function readLocalSchoolOpeningStatus(actor:AccessContext,programId:string) {
  const school=await schoolIdentity(db,programId);
  if(actor.demoFacilitator || !actor.actorPersonId ||
    !["site_leader","room_facilitator","site_staff"].includes(actor.role) ||
    !actor.scope.organizationIds?.includes(school.organizationId) ||
    !actor.scope.siteIds?.includes(school.siteId) ||
    !actor.scope.programIds?.includes(school.programId))
    throw new AuthorizationError("verified local onsite staff for this Program and Site");
  let configuration:Awaited<ReturnType<typeof latestConfiguration>>|null=null;
  try{
    configuration=await latestConfiguration(db,programId);
  }catch(error){
    if(!(error instanceof AuthorizationError))throw error;
  }
  if(!configuration)
    return {programId,schoolSiteId:school.siteId,status:"unconfigured" as const,
      blocked:true,blockers:["opening_evidence","operating_agreement","site_director"],
      approvedAt:null};
  const now=new Date();
  const blockers:string[]=[];
  try{
    await requireChurchHostedOperatingServices(db,programId,[
      "school_of_record","academic_instruction","onsite_supervision",
    ]);
  }catch(error){
    if(!(error instanceof AuthorizationError))throw error;
    blockers.push("operating_agreement");
  }
  try{
    await requireSchoolOpeningEvidence(db,school,configuration.id,now);
  }catch(error){
    if(!(error instanceof AuthorizationError))throw error;
    blockers.push("opening_evidence");
  }
  try{
    await requireVerifiedChurchSiteDirector(db,school,configuration.id,now);
  }catch(error){
    if(!(error instanceof AuthorizationError))throw error;
    blockers.push("site_director");
  }
  const blocked=configuration.status!=="approved"||blockers.length>0;
  return {programId,schoolSiteId:school.siteId,status:configuration.status,
    blocked,blockers,approvedAt:configuration.approvedAt?.toISOString()??null};
}

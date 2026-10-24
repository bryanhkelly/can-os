import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  accessAccounts, accountPersonGrants, documents, organizations, people,
  programs, programResponsibilityAssignments, roleAssignments,
  schoolConfigurationVersions, sites,
} from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError } from "@/domain/command-context";
import { assertCANSteward } from "@/domain/network-agreement-policy";
import { emitEvent, writeAudit } from "@/platform/mutation";
import { requireChurchHostedOperatingServices } from "@/modules/programs/program-site-authorization.server";

type Reader = Pick<typeof db,"select">;
/** These are independently reviewed supporting records, not user checkboxes. */
export const schoolOpeningEvidenceCategories = [
  "school_opening_jurisdiction_authority",
  "school_opening_facility_approval",
  "school_opening_safeguarding_reporting_procedure",
  "school_opening_emergency_response",
  "school_opening_authorized_pickup",
] as const;

async function schoolIdentity(tx:Reader,programId:string){
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
  if(!school?.siteId || school.type!=="church" || !school.delivery.onsite ||
    school.institutionId===school.organizationId ||
    school.siteOwner!==school.organizationId ||
    (school.hostId && school.hostId!==school.organizationId))
    throw new AuthorizationError("independent church/CAN onsite school identity");
  const [can]=await tx.select({id:organizations.id,type:organizations.type})
    .from(organizations).where(eq(organizations.id,school.institutionId)).limit(1);
  if(can?.type!=="can_network")
    throw new AuthorizationError("existing CAN academic institution");
  return school;
}

function verifyCANSchoolApprover(actor:AccessContext,institutionId:string) {
  const originalOrganizations=actor.scope.organizationIds??[];
  if(actor.demoFacilitator || originalOrganizations.length!==1 ||
     !actor.actorPersonId || actor.grantSiteId!==null ||
     !originalOrganizations.includes(institutionId))
    throw new AuthorizationError("verified independent CAN school-opening officer");
  assertCANSteward(actor,{id:institutionId,type:"can_network"},"network.agreements.verify");
}

async function latestConfiguration(tx:Reader,programId:string){
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
  now:Date,decisionPersonId?:string) {
  const docs=await tx.select().from(documents).where(and(
    eq(documents.subjectType,"program"),eq(documents.subjectId,school.programId),
    inArray(documents.category,[...schoolOpeningEvidenceCategories]),
  )).orderBy(desc(documents.createdAt),desc(documents.id)).limit(101);
  if(docs.length>100)throw new AuthorizationError("school opening evidence listing incomplete");
  const mostRecent=new Map<string,(typeof docs)[number]>();
  for(const doc of docs)if(!mostRecent.has(doc.category))mostRecent.set(doc.category,doc);
  const latest=[...schoolOpeningEvidenceCategories].map(category=>{
    const doc=mostRecent.get(category);
    if(!doc || !doc.verifiedAt || doc.verifiedAt>now ||
       !doc.verifiedByPersonId || !doc.expiresAt || doc.expiresAt<=now ||
       doc.uploadedByPersonId===doc.verifiedByPersonId ||
       (decisionPersonId && doc.verifiedByPersonId===decisionPersonId) ||
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
  return latest.map(d=>d.id);
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
) {
  const school=await schoolIdentity(tx,programId);
  const configuration=await latestConfiguration(tx,programId);
  if(configuration.status!=="approved" ||
    !configuration.approvedAt || !configuration.approvedByPersonId ||
    !configuration.effectiveFrom || configuration.effectiveFrom>now ||
    configuration.approvedAt>now || school.programStatus!=="active")
    throw new AuthorizationError("currently approved church school configuration");
  await requireChurchHostedOperatingServices(tx,programId,[
    "school_of_record","academic_instruction","onsite_supervision",
  ]);
  await requireSchoolOpeningEvidence(tx,school,now);
  await requireVerifiedChurchSiteDirector(tx,school,configuration.id,now);
  return {configurationId:configuration.id,version:configuration.version,
    schoolSiteId:school.siteId,hostOrganizationId:school.organizationId};
}

export async function decideChurchSchoolOpening(
  actor:AccessContext,input:{
    programId:string;decision:"approve"|"suspend";reason:string;
  },
) {
  const reason=input.reason.trim();
  if(reason.length<10 || reason.length>500)
    throw new Error("School opening decision requires a 10–500 character reason");
  return db.transaction(async tx=>{
    const [locked]=await tx.select({id:programs.id}).from(programs)
      .where(eq(programs.id,input.programId)).for("update").limit(1);
    if(!locked)throw new AuthorizationError("existing school Program");
    const school=await schoolIdentity(tx,input.programId);
    verifyCANSchoolApprover(actor,school.institutionId);
    const configuration=await latestConfiguration(tx,input.programId);
    const now=new Date();
    if(input.decision==="approve"){
      if(configuration.status!=="draft")
        throw new AuthorizationError("only the latest drafted school configuration can be approved");
      await requireChurchHostedOperatingServices(tx,input.programId,[
        "school_of_record","academic_instruction","onsite_supervision",
      ]);
      const evidence=await requireSchoolOpeningEvidence(tx,school,now,actor.actorPersonId!);
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
        eventType:"ChurchSchoolOpeningApproved",aggregateType:"school_configuration_version",
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
      eventType:"ChurchSchoolOpeningSuspended",aggregateType:"school_configuration_version",
      aggregateId:configuration.id,actorPersonId:actor.actorPersonId,
      organizationId:school.institutionId,siteId:school.siteId,
      programId:input.programId,payload:{reason},
    });
    return {configurationId:configuration.id,status:"suspended" as const};
  });
}

export async function readChurchSchoolOpening(actor:AccessContext,programId:string) {
  const school=await schoolIdentity(db,programId);
  verifyCANSchoolApprover(actor,school.institutionId);
  const config=await latestConfiguration(db,programId);
  let evidenceReady=false;
  try{
    await requireSchoolOpeningEvidence(db,school,new Date());
    await requireChurchHostedOperatingServices(db,programId,[
      "school_of_record","academic_instruction","onsite_supervision",
    ]);
    evidenceReady=true;
  }catch(error){
    if(!(error instanceof AuthorizationError))throw error;
  }
  return {
    programId,siteId:school.siteId,configurationId:config.id,version:config.version,
    status:config.status,evidenceReady,
    evidenceRequired:[...schoolOpeningEvidenceCategories],
    approvedAt:config.approvedAt?.toISOString()??null,
  };
}

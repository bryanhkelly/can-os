import type { Database } from "@/db/client";
import * as s from "@/db/schema";
import { teachingStaffingContext } from "@/modules/staffing/teaching-eligibility.server";

/** Explicit synthetic qualification fixture for disposable integration databases.
 * Does not manufacture account grants, role delegation or agreement authority.
 */
export async function createTeachingQualificationFixture(
  executor:Pick<Database,"select"|"selectDistinctOn"|"insert">,
  input:{sectionId:string;personId:string;verifierPersonId:string;issuedAt?:Date},
){
  const section=await teachingStaffingContext(input.sectionId,executor);
  const suffix=crypto.randomUUID();
  const [definition]=await executor.insert(s.qualificationDefinitions).values({
    key:"test-teaching-"+suffix,kind:"license",title:"Synthetic teaching qualification",
  }).returning();
  const [framework]=await executor.insert(s.complianceFrameworks).values({
    key:"test-teaching-"+suffix,name:"Synthetic teaching policy",authority:"Integration fixture",
  }).returning();
  const [version]=await executor.insert(s.complianceFrameworkVersions).values({
    frameworkId:framework!.id,version:"1",status:"published",
  }).returning();
  await executor.insert(s.compliancePolicyRules).values({
    frameworkVersionId:version!.id,code:"teaching-license",description:"Term-wide teaching evidence",
    expression:{op:"credential",type:definition!.key},evidencePolicy:{},
  });
  await executor.insert(s.compliancePolicyApplicability).values({
    frameworkVersionId:version!.id,organizationId:section.organizationId,
    programId:section.programId,siteId:section.siteId,roleKey:"teacher",
  });
  const [claim]=await executor.insert(s.qualificationClaims).values({
    personId:input.personId,definitionId:definition!.id,
    issuedAt:input.issuedAt??section.window.from,expiresAt:section.window.through,
  }).returning();
  await executor.insert(s.qualificationVerificationEvents).values({
    claimId:claim!.id,sequence:1,decision:"approve",actorPersonId:input.verifierPersonId,
  });
  return {claimId:claim!.id,versionId:version!.id};
}

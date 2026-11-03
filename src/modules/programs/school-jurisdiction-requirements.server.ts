import {and,eq} from "drizzle-orm";
import {db} from "@/db/client";
import {actions} from "@/db/schema";
import type {AccessContext} from "@/domain/access-context";
import {isOfficialJurisdictionSource,type JurisdictionProfile} from "@/domain/jurisdiction-profile";
import type {RequirementDecision} from "@/domain/jurisdiction-applicability";
import {EventTypes} from "@/domain/event-types";
import {emitEvent,writeAudit} from "@/platform/mutation";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
export const jurisdictionRequirementActionType="school_jurisdiction_requirement";

/**
 * This is an Actions projection of independently reviewed policy, NOT another
 * requirement store, an eligibility decision, or proof that an obligation was
 * satisfied. Call under the locked Program from the C independent verifier.
 */
export async function reconcileSchoolJurisdictionRequirementActions(
  tx:Tx,actor:AccessContext,input:{
    programId:string;siteId:string;organizationId:string;
    profileVersionId:string;scopeFingerprint:string;
    profile:JurisdictionProfile;decisions:readonly RequirementDecision[];
  },
) {
  const current=await tx.select().from(actions).where(and(
    eq(actions.type,jurisdictionRequirementActionType),
    eq(actions.subjectType,"program"),eq(actions.subjectId,input.programId),
    eq(actions.organizationId,input.organizationId),
    eq(actions.siteId,input.siteId),eq(actions.programId,input.programId),
  ));
  const decisionById=new Map(input.decisions.map(item=>[item.id,item]));
  const sources=new Map(input.profile.evidence.map(source=>[source.url,source]));
  let created=0,reopened=0;
  for(const requirement of input.profile.requirements){
    if(decisionById.get(requirement.id)?.status!=="applicable")continue;
    const officialSources=requirement.evidenceIds.flatMap(url=>{
      const source=sources.get(url);
      return source && isOfficialJurisdictionSource(source)?[source]:[];
    });
    if(!officialSources.length)continue; // never create a presumed legal obligation without verified evidence
    const prior=current.find(row=>row.metadata.requirementId===requirement.id)??null;
    const stamp={
      requirementId:requirement.id,profileVersionId:input.profileVersionId,
      scopeFingerprint:input.scopeFingerprint,policyRevisionState:"verified_current",
      responsibleParty:requirement.responsibleParty,phase:requirement.phase,
      responsibleRole:requirement.responsibleParty==="church"?"registrar":
        requirement.responsibleParty==="can"?"can_jurisdiction_reviewer":"family_intake_required",
      category:requirement.category??"other",
      filingDeadline:requirement.filingDeadline??null,
      renewalDeadline:requirement.renewalDeadline??null,
      sources:officialSources.map(source=>({
        url:source.url,title:source.title,authority:source.authority,checkedAt:source.checkedAt,
      })),
    };
    if(prior){
      if(prior.metadata.profileVersionId===input.profileVersionId &&
        prior.metadata.scopeFingerprint===input.scopeFingerprint &&
        prior.status!=="cancelled" &&
        prior.metadata.reviewState!=="superseded_by_verified_policy")continue;
      await tx.update(actions).set({
        status:"open",resolvedAt:null,resolutionNote:null,
        metadata:{...prior.metadata,...stamp,
          reviewState:"evidence_requires_reverification",previousEvidenceRetained:true},
        updatedAt:new Date(),
      }).where(eq(actions.id,prior.id));
      await writeAudit(tx,actor,{
        action:"program.jurisdiction.requirement.reopened",
        entityType:"action",entityId:prior.id,
        scope:{organizationId:input.organizationId,siteId:input.siteId,programId:input.programId},
        before:{status:prior.status,scopeFingerprint:prior.metadata.scopeFingerprint,
          profileVersionId:prior.metadata.profileVersionId},
        after:{status:"open",scopeFingerprint:input.scopeFingerprint,
          profileVersionId:input.profileVersionId,requirementId:requirement.id},
      });
      reopened++;
    }else{
      const [inserted]=await tx.insert(actions).values({
        type:jurisdictionRequirementActionType,status:"open",
        priority:requirement.phase==="before_opening"?"high":"normal",
        title:requirement.title,description:requirement.description,
        subjectType:"program",subjectId:input.programId,
        organizationId:input.organizationId,siteId:input.siteId,programId:input.programId,
        metadata:{...stamp,reviewState:"evidence_needed"},
      }).returning({id:actions.id});
      if(!inserted)throw new Error("Could not record canonical jurisdiction requirement Action");
      await writeAudit(tx,actor,{
        action:"program.jurisdiction.requirement.action_created",
        entityType:"action",entityId:inserted.id,
        scope:{organizationId:input.organizationId,siteId:input.siteId,programId:input.programId},
        after:{requirementId:requirement.id,profileVersionId:input.profileVersionId,
          responsibleParty:requirement.responsibleParty,phase:requirement.phase},
      });
      await emitEvent(tx,{
        eventType:EventTypes.ActionCreated,aggregateType:"action",
        aggregateId:inserted.id,actorPersonId:actor.actorPersonId,
        organizationId:input.organizationId,siteId:input.siteId,programId:input.programId,
        payload:{source:jurisdictionRequirementActionType,
          requirementId:requirement.id,profileVersionId:input.profileVersionId},
      });
      created++;
    }
  }
  // The policy is immutable, but its applicability may change after a
  // reviewed Site/Program amendment. Preserve evidence and the historic Action;
  // no longer applicable duties must not remain misleadingly open.
  const applicable=new Set(input.profile.requirements.filter(requirement=>
    decisionById.get(requirement.id)?.status==="applicable").map(item=>item.id));
  let superseded=0;
  for(const prior of current){
    const requirementId=prior.metadata.requirementId;
    if(typeof requirementId!=="string"||applicable.has(requirementId) ||
      prior.status==="cancelled")continue;
    await tx.update(actions).set({
      status:"cancelled",resolvedAt:null,resolutionNote:null,
      metadata:{...prior.metadata,reviewState:"superseded_by_verified_policy",
        supersededByProfileVersionId:input.profileVersionId,
        supersededAt:new Date().toISOString(),historicalEvidenceRetained:true},
      updatedAt:new Date(),
    }).where(eq(actions.id,prior.id));
    await writeAudit(tx,actor,{
      action:"program.jurisdiction.requirement.superseded",
      entityType:"action",entityId:prior.id,
      scope:{organizationId:input.organizationId,siteId:input.siteId,programId:input.programId},
      before:{status:prior.status,profileVersionId:prior.metadata.profileVersionId},
      after:{status:"cancelled",profileVersionId:input.profileVersionId},
    });
    superseded++;
  }
  return {created,reopened,superseded};
}

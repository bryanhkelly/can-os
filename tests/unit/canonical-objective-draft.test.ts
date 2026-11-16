import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  canonicalAssessmentDraftDatabaseRole,canonicalObjectiveDraftInput,
  assertPublisherObjectiveAttemptLimit,
} from "@/domain/canonical-objective-draft";
import {
  sealNoncreditAnswerKey,openNoncreditAnswerKey,
} from "@/domain/noncredit-knowledge-check";

const org="11110000-0000-4000-8000-000000000001";
const example={
  courseVersionId:"11110000-0000-4000-8000-000000000020",
  assessmentKey:"ai_skill_check_01",
  title:"AI Skills Knowledge Check",
  passingFraction:0.8,maxAttempts:3,
  questions:[{
    prompt:"Which statement describes a secure prompt?",
    choices:["Exclude private participant data","Post learner details publicly"],
    correctIndex:0,
  }],
};
const read=(p:string)=>readFileSync(p,"utf8");
describe("canonical Course objective draft authoring",()=>{
  it("accepts a reusable one-hour pilot knowledge check, not a hardcoded five",()=>{
    const valid=canonicalObjectiveDraftInput.parse(example);
    expect(valid.questions).toHaveLength(1);
    const five={...example,questions:Array.from({length:5},(_,i)=>({
      ...example.questions[0],prompt:`Question ${i+1} examines secure AI usage`,
    }))};
    expect(canonicalObjectiveDraftInput.parse(five).questions).toHaveLength(5);
  });
  it("rejects duplicate choices, out-of-range correct answers and invalid attempts",()=>{
    expect(canonicalObjectiveDraftInput.safeParse({
      ...example,questions:[{...example.questions[0],correctIndex:2}],
    }).success).toBe(false);
    expect(canonicalObjectiveDraftInput.safeParse({
      ...example,questions:[{...example.questions[0],choices:["yes","YES"]}],
    }).success).toBe(false);
    expect(canonicalObjectiveDraftInput.safeParse({...example,maxAttempts:0}).success).toBe(false);
    expect(canonicalObjectiveDraftInput.safeParse({...example,passingFraction:0.4}).success).toBe(false);
    expect(canonicalObjectiveDraftInput.safeParse({...example,
      questions:Array.from({length:11},()=>example.questions[0]),
    }).success).toBe(false);
  });
  it("derives the NOLOGIN author role only from a single verified organization and curriculum capability",()=>{
    expect(canonicalAssessmentDraftDatabaseRole({
      scope:{organizationIds:[org]},capabilities:new Set(["curriculum.publish"]),
    })).toBe("can_v30_assess_draft_author_11110000000040008000000000000001");
    expect(()=>canonicalAssessmentDraftDatabaseRole({
      scope:{organizationIds:[org]},capabilities:new Set(),
    })).toThrow();
    expect(()=>canonicalAssessmentDraftDatabaseRole({
      scope:{organizationIds:[org,org]},capabilities:new Set(["curriculum.publish"]),
    })).toThrow();
  });
  it("prevents a local Site from increasing a nationally published retake cap",()=>{
    const approved={source:"course-activities",maxAttempts:3};
    expect(()=>assertPublisherObjectiveAttemptLimit(approved,3)).not.toThrow();
    expect(()=>assertPublisherObjectiveAttemptLimit(approved,2)).not.toThrow();
    expect(()=>assertPublisherObjectiveAttemptLimit(approved,4)).toThrow();
    expect(()=>assertPublisherObjectiveAttemptLimit(
      {source:"course-activities",maxAttempts:null},1)).toThrow();
    expect(()=>assertPublisherObjectiveAttemptLimit({},4)).not.toThrow();
  });
  it("seals keys with per-item authenticated encryption, not plaintext or a client-readable key",()=>{
    const key="ad".repeat(32);
    const itemVersionId=randomUUID();
    const optionId=randomUUID();
    const sealed=sealNoncreditAnswerKey(key,itemVersionId,[optionId]);
    expect(sealed.toString("utf8")).not.toContain(optionId);
    expect(openNoncreditAnswerKey(key,itemVersionId,sealed)).toEqual([optionId]);
    expect(()=>openNoncreditAnswerKey(key,randomUUID(),sealed)).toThrow();
    expect(()=>openNoncreditAnswerKey("01".repeat(32),itemVersionId,sealed)).toThrow();
  });
  it("never grants table-wide DML or public access to the canonical answer keys",()=>{
    const patch=read("database/canonical/v3.0.1/patch-canonical-assessment-draft-authoring.sql");
    const provision=read("database/canonical/v3.0.1/provision-canonical-assessment-draft-role.sql");
    const service=read("src/modules/classes/canonical-objective-draft.functions.ts");
    expect(patch).toContain("SECURITY DEFINER");
    expect(patch).toContain("v28_role_can_access_org");
    expect(patch).toContain("REVOKE ALL ON FUNCTION");
    expect(patch).toContain("assessment_item_secure_keys");
    expect(patch).toContain("Sealed answer key is missing");
    expect(provision).toContain("NOLOGIN NOINHERIT NOBYPASSRLS");
    expect(provision).toContain("WITH INHERIT FALSE, SET TRUE");
    expect(provision).not.toContain("GRANT SELECT,INSERT ON education_v30.assessment_");
    expect(provision).not.toContain("GRANT UPDATE ON education_v30.assessment_");
    expect(service).toContain("SET LOCAL ROLE");
    expect(service).toContain("sealNoncreditAnswerKey(hex,itemVersionId,[correct.id])");
    expect(service).toContain('process.env.CAN_CANONICAL_ASSESSMENT_DRAFT_ENABLED!=="true"');
  });
  it("preserves canonical governed publication and returns no secure item answers",()=>{
    const patch=read("database/canonical/v3.0.1/patch-canonical-assessment-draft-authoring.sql");
    const service=read("src/modules/classes/canonical-objective-draft.functions.ts");
    expect(patch).toContain("RETURN QUERY SELECT version_id,form_version,question_index");
    expect(patch).toContain("'draft'");
    expect(patch).not.toContain("UPDATE assessment_versions SET lifecycle='published'");
    expect(patch).not.toContain("UPDATE assessment_item_versions SET lifecycle='published'");
    expect(service).toContain("listCanonicalObjectiveDrafts");
    expect(service).not.toContain("return {correctOptionIds:");
    expect(service).not.toContain("return {encryptedKeyBase64:");
  });
});

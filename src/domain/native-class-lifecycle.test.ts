import { describe, expect, it } from "vitest";
import {
  assertNativeClassRepeatEligible, assertOperationalClassEnrollmentMethods,
  planNativeClassExit,
  assertNativeClassOperatorExitScope,
  assertNativeClassLearnerSessionForExit, assertOperationalClassOfferingTerms,
  assertNativeClassAttemptForExit,
} from "./native-class-lifecycle";
import type { CommandContext } from "./command-context";

describe("WS2 native Class enrollment lifecycle", () => {
  it("withdraws active participation and releases capacity", () => {
    expect(planNativeClassExit("active", "withdraw")).toEqual({
      enrollmentStatus:"withdrawn",attemptStatus:"withdrawn",
      releasedSeat:true,alreadyClosed:false,
    });
  });
  it("cancels a pending request without inventing a Course Attempt", () => {
    expect(planNativeClassExit("pending", "withdraw")).toEqual({
      enrollmentStatus:"cancelled",attemptStatus:null,
      releasedSeat:true,alreadyClosed:false,
    });
    expect(planNativeClassExit("pending", "cancel").enrollmentStatus).toBe("cancelled");
  });
  it("operator cancellation also withdraws the active Course Attempt", () => {
    expect(planNativeClassExit("active", "cancel")).toEqual({
      enrollmentStatus:"cancelled",attemptStatus:"withdrawn",
      releasedSeat:true,alreadyClosed:false,
    });
  });
  it("idempotent same-command retries produce no second seat release", () => {
    expect(planNativeClassExit("withdrawn", "withdraw").alreadyClosed).toBe(true);
    expect(planNativeClassExit("cancelled", "cancel").alreadyClosed).toBe(true);
    // Pending learner withdrawal ends in cancelled, not withdrawn.
    expect(planNativeClassExit("cancelled", "withdraw")).toEqual({
      enrollmentStatus:"cancelled",attemptStatus:null,
      releasedSeat:false,alreadyClosed:true,
    });
  });
  it("never changes terminal results or resurrects historical enrollments", () => {
    for (const status of ["completed", "withdrawn", "cancelled"] as const) {
      for (const action of ["withdraw", "cancel"] as const) {
        if ((status==="withdrawn"&&action==="withdraw") ||
            (status==="cancelled"&&(action==="cancel"||action==="withdraw"))) continue;
        expect(() => planNativeClassExit(status, action)).toThrow();
      }
    }
  });
  it("rejects non-operational publisher methods", () => {
    expect(() => assertOperationalClassEnrollmentMethods(["self","assignment"])).not.toThrow();
    for (const methods of [
      [],["invitation"],["approval"],["self","approval"],
      ["assignment","invitation"],["self","self"],
    ]) expect(() => assertOperationalClassEnrollmentMethods(methods)).toThrow();
  });
  it("rejects unverified for-credit claims and invalid credit methods",()=>{
    for(const terms of [
      {enrollmentMethods:["self"],allowedCreditModes:["for_credit"]},
      {enrollmentMethods:["assignment"],allowedCreditModes:["for_credit"]},
      {enrollmentMethods:["self","invitation"],allowedCreditModes:["audit"]},
      {enrollmentMethods:["self"],allowedCreditModes:[]},
      {enrollmentMethods:["self"],allowedCreditModes:["audit","audit"]},
      {enrollmentMethods:["self"],allowedCreditModes:["something_else"]},
    ]){
      expect(()=>assertOperationalClassOfferingTerms(terms)).toThrow();
    }
    expect(()=>assertOperationalClassOfferingTerms({
      enrollmentMethods:["self","assignment"],
      allowedCreditModes:["audit","not_applicable"],
    })).not.toThrow();
  });
  it("allows new registration after withdrawal, not ungoverned completed repeat", () => {
    expect(() => assertNativeClassRepeatEligible(["withdrawn","cancelled"])).not.toThrow();
    expect(() => assertNativeClassRepeatEligible(["completed","withdrawn"])).toThrow();
  });
});

describe("WS2 negative enrollment authorization boundaries",()=>{
  const org="11111111-1111-4111-8111-111111111111";
  const site="22222222-2222-4222-8222-222222222222";
  const person="33333333-3333-4333-8333-333333333333";
  const operator:CommandContext={
    actorPersonId:person,role:"registrar",
    capabilities:new Set(["class.manage"]),
    scope:{organizationIds:[org],siteIds:[site]},
  };
  const cls={operatingOrganizationId:org,siteId:site};
  it("denies another Site and another Organization",()=>{
    expect(()=>assertNativeClassOperatorExitScope(operator,cls)).not.toThrow();
    expect(()=>assertNativeClassOperatorExitScope(operator,{...cls,siteId:"other-site"})).toThrow();
    expect(()=>assertNativeClassOperatorExitScope(operator,{
      ...cls,operatingOrganizationId:"other-org",
    })).toThrow();
  });
  it("denies broad scope, no Site, wrong role or missing capability",()=>{
    const fixtures:CommandContext[]=[
      {...operator,scope:{...operator.scope,siteIds:[site,"other"]}},
      {...operator,scope:{...operator.scope,organizationIds:[org,"other"]}},
      {...operator,role:"learner"},
      {...operator,capabilities:new Set()},
      {...operator,actorPersonId:null},
    ];
    fixtures.forEach(actor=>expect(()=>assertNativeClassOperatorExitScope(actor,cls)).toThrow());
    expect(()=>assertNativeClassOperatorExitScope(operator,{...cls,siteId:null})).toThrow();
  });
  it("denies switched Person, role, Organization, Site and missing restricted session values",()=>{
    const grant={
      person_id:person,role_code:"learner",
      organization_id:org,site_id:null,
    };
    expect(()=>assertNativeClassLearnerSessionForExit(grant,person,org)).not.toThrow();
    const variants=[
      {...grant,person_id:"unrelated"},
      {...grant,role_code:"guardian"},
      {...grant,role_code:"site_admin"},
      {...grant,organization_id:"unrelated"},
      {...grant,site_id:site},
      {...grant,person_id:undefined},
    ];
    variants.forEach(value=>expect(()=>assertNativeClassLearnerSessionForExit(value,person,org)).toThrow());
  });
});

describe("WS2 exact native Class Course Attempt exit authority",()=>{
  const enrollmentId="11111111-1111-4111-8111-111111111111";
  const attemptId="22222222-2222-4222-8222-222222222222";
  const deploymentId="33333333-3333-4333-8333-333333333333";
  const adoptionId="44444444-4444-4444-8444-444444444444";
  const offeringVersionId="55555555-5555-4555-8555-555555555555";
  const courseVersionId="66666666-6666-4666-8666-666666666666";
  const classInstance={deploymentId,adoptionId,offeringVersionId,courseVersionId};
  const enrollment={id:enrollmentId,courseAttemptId:attemptId};
  const attempt={
    id:attemptId,classEnrollmentId:enrollmentId,
    enrollmentId:null,noncreditRegistrationId:null,sectionId:null,
    deploymentId,adoptionId,offeringVersionId,courseVersionId,
    status:"active" as const,
  };
  it("permits only an active, exactly linked Class attempt",()=>{
    expect(()=>assertNativeClassAttemptForExit({
      attempt,enrollment,classInstance,
    })).not.toThrow();
    for(const broken of [
      {...attempt,classEnrollmentId:"other"},
      {...attempt,enrollmentId:"other"},
      {...attempt,noncreditRegistrationId:"other"},
      {...attempt,sectionId:"other"},
      {...attempt,deploymentId:"other"},
      {...attempt,adoptionId:"other"},
      {...attempt,offeringVersionId:"other"},
      {...attempt,courseVersionId:"other"},
      {...attempt,status:"completed" as const},
      {...attempt,status:"withdrawn" as const},
    ])expect(()=>assertNativeClassAttemptForExit({
      attempt:broken,enrollment,classInstance,
    })).toThrow();
    expect(()=>assertNativeClassAttemptForExit({
      attempt:{...attempt,id:"not-selected"},enrollment,classInstance,
    })).toThrow();
  });
  it("can close additional linked live retakes without rewriting history",()=>{
    expect(()=>assertNativeClassAttemptForExit({
      attempt:{...attempt,id:"second-live"},enrollment,classInstance,
      requireSelectedPointer:false,
    })).not.toThrow();
    expect(()=>assertNativeClassAttemptForExit({
      attempt:{...attempt,id:"second-live",classEnrollmentId:"unrelated"},
      enrollment,classInstance,requireSelectedPointer:false,
    })).toThrow();
  });
});

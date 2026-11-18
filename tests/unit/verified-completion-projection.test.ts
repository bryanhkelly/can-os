import { describe, expect, it } from "vitest";
import {
  countCurrentNoncreditCompletions, currentNoncreditCompletionStates, projectCurrentNoncreditCompletion,
  projectUnverifiedClassOutcome,projectCurrentNativeClassCompletion,
  type NoncreditCompletionDecisionRef,
} from "@/domain/verified-completion-projection";

const old: NoncreditCompletionDecisionRef = {
  id: "decision-1", registrationId: "registration-A", outcome: "completed",
  supersedesId: null, decidedAt: new Date("2026-11-16T08:00:00.000Z"),
};
const newer: NoncreditCompletionDecisionRef = {
  ...old,id:"decision-2",outcome:"voided",supersedesId:old.id,
  decidedAt:new Date("2026-11-16T09:00:00.000Z"),
};
const correction: NoncreditCompletionDecisionRef = {
  ...old,id:"decision-3",outcome:"not_yet_completed",supersedesId:newer.id,
  decidedAt:new Date("2026-11-16T10:00:00.000Z"),
};
const project = (rows: readonly NoncreditCompletionDecisionRef[]) =>
  projectCurrentNoncreditCompletion("registration-A",rows);

describe("WS3 completion reference source of truth",()=>{
  it("projects a standalone authorized completion decision into WS1 outcome shape",()=>{
    expect(project([old])).toEqual({
      state:"completed",decisionId:"decision-1",
      completedAt:"2026-11-16T08:00:00.000Z",
      outcome:{label:"Verified completion",referenceId:"decision-1"},
    });
  });
  it("resolves append-only corrections in any input order",()=>{
    expect(project([correction,old,newer])).toEqual({
      state:"not_yet_completed",decisionId:"decision-3",completedAt:null,
      outcome:{label:"Not yet completed",referenceId:"decision-3"},
    });
    expect(project([newer,old]).state).toBe("voided");
  });
  it("never counts both original and corrective completion",()=>{
    expect(countCurrentNoncreditCompletions(new Map([
      ["registration-A",[newer,old]],
      ["registration-B",[{...old,id:"b",registrationId:"registration-B"}]],
    ]))).toEqual({verifiedCompletions:1,undeterminedRegistrations:[]});
  });
  it("returns unavailable when an earlier decision has two conflicting replacements",()=>{
    expect(project([old,newer,{
      ...newer,id:"decision-4",supersedesId:old.id,
    }])).toEqual({state:"unavailable",reason:"invalid_history"});
  });
  it("returns unavailable for orphan, duplicate, self-linked or cyclic history",()=>{
    expect(project([{...newer,supersedesId:"missing"}]).state).toBe("unavailable");
    expect(project([old,old]).state).toBe("unavailable");
    expect(project([{...old,supersedesId:old.id}]).state).toBe("unavailable");
    expect(project([{...old,supersedesId:"decision-2"},newer]).state).toBe("unavailable");
    expect(project([old,{...old,id:"another-root"}]).state).toBe("unavailable");
  });
  it("rejects source mixing, invalid dates and nonmonotonic revisions",()=>{
    expect(project([{...old,registrationId:"other"}]).state).toBe("unavailable");
    expect(project([{...old,decidedAt:new Date("invalid")}]).state).toBe("unavailable");
    expect(project([old,{...newer,decidedAt:new Date("2026-11-16T07:00:00.000Z")}]).state)
      .toBe("unavailable");
  });
  it("does not fabricate completion when no decision exists",()=>{
    expect(project([])).toMatchObject({
      state:"not_decided",outcome:null,completedAt:null,
    });
  });
  it("leaves native Class outcomes unavailable until independent policy authority exists",()=>{
    expect(projectUnverifiedClassOutcome()).toEqual({
      outcome:null,completedAt:null,reason:"class_completion_authority_unavailable",
    });
  });
  it("identifies incomplete histories instead of publishing optimistic totals",()=>{
    expect(countCurrentNoncreditCompletions(new Map([
      ["registration-A",[old,old]],
    ]))).toEqual({verifiedCompletions:0,undeterminedRegistrations:["registration-A"]});
  });
});


describe("COGIC cohort and Site reporting decision reconciliation",()=>{
  it("counts corrected completions only while the supersession chain remains completed",()=>{
    const registrationIds=["registration-A","registration-B","registration-C"];
    const source=[
      old,newer,
      {...old,id:"b-1",registrationId:"registration-B"},
      {...old,id:"c-1",registrationId:"registration-C",outcome:"not_yet_completed" as const},
    ];
    const result=currentNoncreditCompletionStates(registrationIds,source);
    expect(result.invalidRegistrations).toEqual([]);
    expect(result.states.get("registration-A")).toBe("voided");
    expect(result.states.get("registration-B")).toBe("completed");
    expect(result.states.get("registration-C")).toBe("not_yet_completed");
    expect([...result.states.values()].filter(value=>value==="completed")).toHaveLength(1);
  });
  it("keeps undecided registrations separate from approved outcomes",()=>{
    const result=currentNoncreditCompletionStates(
      ["registration-A","registration-B"],[old]);
    expect(result.invalidRegistrations).toEqual([]);
    expect(result.states.get("registration-A")).toBe("completed");
    expect(result.states.get("registration-B")).toBe("not_decided");
  });
  it("fails closed on conflicting correction chains, truncated history, or cross-scope rows",()=>{
    const fork={...newer,id:"decision-4",supersedesId:old.id};
    expect(currentNoncreditCompletionStates(
      ["registration-A"],[old,newer,fork]).invalidRegistrations).toEqual(["registration-A"]);
    expect(currentNoncreditCompletionStates(
      ["registration-A"],[newer]).invalidRegistrations).toEqual(["registration-A"]);
    expect(currentNoncreditCompletionStates(
      ["registration-A"],[{...old,registrationId:"other"}]).invalidRegistrations)
      .toEqual(["other"]);
  });
});

describe("WS3 native Class Activity projection",()=>{
  const first={
    id:"class-decision-1",classEnrollmentId:"class-enrollment-A",
    sourceKind:"ws3_governed",completionPolicyVersionId:"class-policy-A",
    resultCode:"completed" as const,supersedesOutcomeId:null,
    currentValidity:true,
  };
  it("shows verified Class outcome only after canonical current source is valid",()=>{
    expect(projectCurrentNativeClassCompletion("class-enrollment-A",[first]))
      .toEqual({state:"completed",verifiedCompletion:true,
        decisionId:"class-decision-1",
        outcome:{label:"Verified Class completion",referenceId:"class-decision-1"}});
    expect(projectCurrentNativeClassCompletion("class-enrollment-A",[
      {...first,currentValidity:false},
    ])).toMatchObject({state:"source_invalid",verifiedCompletion:false});
  });
  it("retains terminal Enrollment history without treating a correction as valid",()=>{
    const revised={...first,id:"class-decision-2",resultCode:"voided" as const,
      supersedesOutcomeId:"class-decision-1",currentValidity:false};
    expect(projectCurrentNativeClassCompletion("class-enrollment-A",[
      first,revised,
    ])).toMatchObject({state:"voided",verifiedCompletion:false,
      decisionId:"class-decision-2"});
  });
  it("fails closed for unapproved Class outcomes, duplicate or branching source",()=>{
    expect(projectCurrentNativeClassCompletion("class-enrollment-A",[
      {...first,sourceKind:"unverified_host_note"},
    ]).state).toBe("unavailable");
    expect(projectCurrentNativeClassCompletion("class-enrollment-A",[first,first])
      .state).toBe("unavailable");
    expect(projectCurrentNativeClassCompletion("class-enrollment-A",[
      first,{...first,id:"extra-root"},
    ]).state).toBe("unavailable");
    expect(projectCurrentNativeClassCompletion("class-enrollment-A",[
      {...first,classEnrollmentId:"other-Class"},
    ]).state).toBe("unavailable");
  });
});

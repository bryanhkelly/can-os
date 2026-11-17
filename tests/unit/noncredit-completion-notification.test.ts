import { describe, expect, it } from "vitest";
import { EventTypes } from "@/domain/event-types";
import { getNotificationPolicy } from "@/platform/notifications/policy";
import "@/platform/notifications/policies";
import { noncreditTrainingCompletedPolicy } from "@/platform/notifications/policies/noncredit-training-completed";

const decisionId="11111111-1111-4111-8111-111111111111";
const registrationId="22222222-2222-4222-8222-222222222222";
const personId="33333333-3333-4333-8333-333333333333";
const policyId="44444444-4444-4444-8444-444444444444";
const event={
  id:"55555555-5555-4555-8555-555555555555",
  eventType:EventTypes.NoncreditTrainingCompleted,
  aggregateType:"noncredit_completion_decision",aggregateId:decisionId,payload:{},
} as never;
const record={
  id:decisionId, registrationId, participantPersonId:personId,
  outcome:"completed", registrationStatus:"completed",
  policyId, decisionPolicyId:policyId,
};
function fakeTx(rows:unknown[][]) {
  return { select() {
    const values=rows.shift()??[];
    const query={
      from:()=>query,innerJoin:()=>query,where:()=>query,
      limit:async()=>values,
    };
    return query;
  }} as never;
}

describe("verified noncredit completion notifications",()=>{
  it("registers with the existing notification policy dispatcher",()=>{
    expect(getNotificationPolicy(EventTypes.NoncreditTrainingCompleted))
      .toBe(noncreditTrainingCompletedPolicy);
  });
  it("only projects completed, current decisions with a verified CAN Person bridge",async()=>{
    const context=await noncreditTrainingCompletedPolicy.load(fakeTx([
      [record],[],[{recipientPersonId:personId}],
    ]),event);
    expect(context).toEqual({recipientPersonId:personId,decisionId});
    const plans=noncreditTrainingCompletedPolicy.plans(context!,event);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({recipientPersonId:personId,
      resourceType:"noncredit_completion_decision",resourceId:decisionId});
    expect(plans[0]!.body).toContain("not a certificate or school credit");
  });
  it("ignores superseded, withdrawn, or non-completed decisions",async()=>{
    expect(await noncreditTrainingCompletedPolicy.load(
      fakeTx([[record],[{id:"later"}]]),event)).toBeNull();
    expect(await noncreditTrainingCompletedPolicy.load(
      fakeTx([[{...record,registrationStatus:"withdrawn"}]]),event)).toBeNull();
    expect(await noncreditTrainingCompletedPolicy.load(
      fakeTx([[{...record,outcome:"not_yet_completed"}]]),event)).toBeNull();
  });
  it("does not infer a CAN recipient if the explicit bridge is missing",async()=>{
    expect(await noncreditTrainingCompletedPolicy.load(
      fakeTx([[record],[],[]]),event)).toBeNull();
  });
});

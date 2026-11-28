import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
const read=(path:string)=>readFileSync(path,"utf8");

describe("native Class transfer and completed-repeat contracts",()=>{
 const transfer=read("src/modules/classes/native-class-transfers.functions.ts");
 const repeat=read("src/modules/classes/native-class-repeats.server.ts");
 const repeatRpc=read("src/modules/classes/native-class-repeats.functions.ts");
 const enrollment=read("src/modules/classes/native-class-enrollment.functions.ts");
 const assignment=read("src/modules/classes/native-class-assignment.server.ts");
 const guardian=read("src/modules/classes/native-class-guardian-enrollment.functions.ts");
 const learner=read("src/routes/class.tsx");

 it("locks both Classes deterministically before changing either enrollment",()=>{
  expect(transfer).toContain("classIds=[sourceLocator.classId,destinationLocator.classId].sort()");
  expect(transfer).toContain("orderBy(asc(canonicalClasses.id)).for(\"update\")");
  expect(transfer).toContain('source.status!=="active"');
  expect(transfer).toContain("assertCurrentNativeClassLearnerForMutation");
  expect(transfer).toContain("withdrawNativeClassAttempts(tx,source,sourceClass)");
  expect(transfer).toContain("assertNativeSelfEnrollmentEligible");
  expect(transfer).toContain("assertNativeClassSeatAvailable");
 });
 it("preserves source history, creates one destination Attempt and attribution",()=>{
  expect(transfer).toContain('set({status:"withdrawn"})');
  expect(transfer).toContain("tx.insert(canonicalClassEnrollments)");
  expect(transfer).toContain("createInitialNativeClassAttempt(tx,destination.id,destinationAuthority)");
  expect(transfer).toContain("writeNativeClassAttribution(tx,");
  expect(transfer).toContain('eventType:"ClassEnrollmentTransferred"');
  expect(transfer).toContain("sourceAttemptIdsClosed:closedAttemptIds");
  expect(learner).toContain("<EnrolledClassCard");
  const card=read("src/components/learning/native-class/EnrolledClassCard.tsx");
  expect(card).toContain("transferMyNativeClassEnrollment");
  expect(card).toContain("I accept the destination Class terms");
 });
 it("blocks completed destination repeats without an independent authorization",()=>{
  expect(transfer).toContain('assertNativeClassRepeatEligible(completed?["completed"]:[])');
  expect(repeat).toContain('completion.completionDecidedByPersonId===actor.actorPersonId');
  expect(repeat).toContain('eq(canonicalClassOutcomes.resultCode,"completed")');
  expect(repeat).toContain("completion.completionPolicyVersionId");
  expect(repeat).toContain("isNull(canonicalClassEnrollmentRepeatAuthorizations.consumedByEnrollmentId)");
 });
 it("keeps repeat authorization in a server-only owner",()=>{
  expect(repeatRpc).not.toContain("@/db/");
  expect(repeatRpc).not.toContain("requireNativeRepeatAuthorization");
  expect(repeatRpc).toContain('await import("./native-class-repeats.server")');
  expect(repeat).toContain('export async function requireNativeRepeatAuthorization(');
  for(const source of [enrollment,assignment,guardian]){
   expect(source).toContain('from "./native-class-repeats.server"');
   expect(source).not.toContain('from "./native-class-repeats.functions"');
  }
 });
 it("consumes authorized repeat only inside successful Class admission",()=>{
  const consumption=read("src/modules/classes/native-class-repeat-consumption.server.ts");
  expect(consumption).toContain("ClassRepeatAuthorizationConsumed");
  expect(consumption).toContain("consumedByEnrollmentId:input.classEnrollmentId");
  expect(consumption).toContain("if(!consumed)throw");
  for(const source of [enrollment,assignment,guardian]){
   expect(source).toContain("requireNativeRepeatAuthorization");
   expect(source).toContain("consumeNativeClassRepeatAuthorization(tx,");
   expect(source.indexOf("consumeNativeClassRepeatAuthorization(tx,")).toBeGreaterThan(source.indexOf("await createInitialNativeClassAttempt("));
  }
 });
});

import {describe,expect,it} from "vitest";
import {assessOneRosterPlacementReplay} from "@/domain/oneroster-placement-decision";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
const input={
 programId:"program",siteId:"site",studentProfileId:"student",sectionId:"section",
 externalSchoolSourcedId:"school",externalUserSourcedId:"user",
 externalClassSourcedId:"class",sourceHash:"a".repeat(64),
};
const prior={entityType:"enrollment",entityId:"enrollment",
 metadata:{...input,approvedByPersonId:"registrar"}};
describe("durable OneRoster placement decisions",()=>{
 it("allows a new decision and idempotent replays",()=>{
  expect(assessOneRosterPlacementReplay(null,input).disposition).toBe("new");
  expect(assessOneRosterPlacementReplay(prior,input)).toEqual({
   enrollmentId:"enrollment",disposition:"idempotent_retry"});
 });
 it("records same-destination reimports, but not silent remapping",()=>{
  expect(assessOneRosterPlacementReplay(prior,{...input,sourceHash:"b".repeat(64)}).disposition)
   .toBe("same_destination_reimport");
 });
 it.each(["programId","siteId","studentProfileId","sectionId",
  "externalSchoolSourcedId","externalUserSourcedId","externalClassSourcedId"] as const)(
  "rejects %s changes",field=>{
   expect(()=>assessOneRosterPlacementReplay(prior,{...input,[field]:"other"}))
    .toThrow(/reconciliation required/);
  });
 it("fails closed for missing approval or a wrong mapping type",()=>{
  expect(()=>assessOneRosterPlacementReplay({...prior,entityType:"section"},input))
   .toThrow(/different mapping type/);
  expect(()=>assessOneRosterPlacementReplay({...prior,metadata:{...input}},input))
   .toThrow(/provenance missing/);
 });
 it("persists the import decision and checks live canonical revocation on retry",()=>{
  const source=readFileSync(resolve(process.cwd(),"src/modules/learning/oneroster-import.functions.ts"),"utf8");
  const fn=source.split("export const approveOneRosterSectionPlacement=")[1]??"";
  expect(fn).toContain('const placementIdentifier="enrollment:"');
  expect(fn).toContain("assessOneRosterPlacementReplay(priorPlacement??null,requested)");
  expect(fn).toContain('live.status!=="active"');
  expect(fn).toContain('entityType:"enrollment"');
  expect(fn).toContain("activateSectionEnrollment(tx,");
  expect(fn).toContain('action:"curriculum.interop.oneroster.placement.replay"');
  expect(fn).not.toContain("tx.insert(enrollments)");
 });
});

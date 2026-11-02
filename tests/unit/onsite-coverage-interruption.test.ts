import {describe,expect,it} from "vitest";
import {hasOnsiteCoverageInterruption} from "@/domain/onsite-coverage-interruption";

const block={
 sectionId:"section-A",periodId:"period-1",planToken:"current-plan",
 primaryPersonId:"staff-primary",backupPersonId:"staff-backup",
};
const event={
 sectionId:"section-A",personId:"staff-backup",
 metadata:{periodId:"period-1",planToken:"current-plan"},
};
describe("onsite physical coverage interruption",()=>{
 it("invalidates witnessed coverage when either named adult reports leaving",()=>{
  expect(hasOnsiteCoverageInterruption(block,[event])).toBe(true);
  expect(hasOnsiteCoverageInterruption(block,[{...event,personId:"staff-primary"}])).toBe(true);
 });
 it("does not mistake stale room tokens, unrelated Sections or third parties for current coverage",()=>{
  expect(hasOnsiteCoverageInterruption(block,[{...event,metadata:{...event.metadata,planToken:"retired"}}])).toBe(false);
  expect(hasOnsiteCoverageInterruption(block,[{...event,sectionId:"section-B"}])).toBe(false);
  expect(hasOnsiteCoverageInterruption(block,[{...event,personId:"unrelated"}])).toBe(false);
  expect(hasOnsiteCoverageInterruption(block,[])).toBe(false);
 });
});

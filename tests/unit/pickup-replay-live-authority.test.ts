import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
describe("pickup idempotency is not a substitute for current relationship grants",()=>{
  const source=readFileSync("src/modules/operations/pickup.functions.ts","utf8");
  it("verifies guardian and canonical household before returning a prior authorization ID",()=>{
    const block=source.slice(source.indexOf("export const createPickupAuthorization"),source.indexOf("export const revokePickupAuthorization"));
    expect(block.indexOf("const student = await guardianStudent(tx, actor, data);"))
      .toBeLessThan(block.indexOf('source("guardian-pickup-authorization"'));
    expect(block.indexOf("const student = await guardianStudent(tx, actor, data);"))
      .toBeLessThan(block.indexOf("if (replay) {"));
  });
  it("rechecks staff or guardian entitlement and household before replaying a custody hold",()=>{
    const block=source.slice(source.indexOf("export const createPickupCustodyHold"),source.indexOf("export const resolvePickupCustodyHold"));
    const verify=block.indexOf("const student = guardian ? await guardianStudent(tx, actor, data)");
    const household=block.indexOf("await assertStudentHousehold(tx, data.studentProfileId, data.householdId)");
    expect(verify).toBeGreaterThanOrEqual(0);
    expect(household).toBeGreaterThan(verify);
    expect(household).toBeLessThan(block.indexOf("if (replay) {"));
  });
});

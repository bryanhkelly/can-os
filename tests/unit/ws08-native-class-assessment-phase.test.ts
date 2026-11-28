import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
const read=(p:string)=>readFileSync(p,"utf8");
describe("native Class baseline versus completion assessment authority",()=>{
 it("requires both SQL paths and the application projection to exclude diagnostic results",()=>{
  const sql=read("database/canonical/v3.0.1/patch-ws3-class-governed-outcomes.sql");
  expect(sql.split("definition.purpose IN ('formative','practice','readiness','mastery')")).toHaveLength(3);
  expect(read("src/modules/classes/native-class-completion.server.ts")).toContain('inArray(assessmentDefinitions.purpose,["formative","practice","readiness","mastery"])');
 });
 it("requires installed phase-aware guards before granting, executing or finalizing diagnostic assessments",()=>{
  for(const path of ["src/modules/classes/native-class-assessment-provision.server.ts","src/modules/classes/native-class-assessment-finalize.server.ts","src/modules/learning/native-class-assessment-scope.server.ts"]){expect(read(path)).toContain("await assertNativeClassDiagnosticAuthority(tx)");}
 });
});

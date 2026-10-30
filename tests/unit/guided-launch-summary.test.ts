import { describe, expect, it } from "vitest";
import { summarizeFullFlowOperations } from "../../src/domain/full-flow-operational-snapshot";
import { guidedSchoolJourney } from "../../src/domain/guided-school-journey";
const program=summarizeFullFlowOperations({
 programs:[{id:"program",name:"K–8 School",status:"active",type:"church_hosted_academy",siteId:"site",
 academicProviderOrganizationId:"can",creditIssuingOrganizationId:"can"}],
 sections:[],teacherAssignments:[],adoptions:[],applications:[],enrollments:[],assessments:[],submissions:[],responses:[],
}).programs[0]!;
describe("launch summary distinguishes records from current authorization",()=>{
 it("does not certify current opening authority from Program active alone",()=>{
  const step=guidedSchoolJourney(program,null).find(step=>step.key==="launch")!;
  expect(step.state).toBe("review");
  expect(step.evidence).toContain("review current opening authority");
  expect(step.href).toBe("/sites/site");
  expect(step.title).not.toContain("high school");
 });
 it("reports unavailable launch evidence instead of inferring zero blockers",()=>{
  const step=guidedSchoolJourney({...program,status:"launching"},null)[0]!;
  expect(step.state).toBe("needs_attention");
  expect(step.evidence).toContain("Journey unavailable");
  expect(step.evidence).not.toContain("0 recorded blocking");
 });
 it("retains actual recorded blockers from an available Journey",()=>{
  const step=guidedSchoolJourney({...program,status:"launching"},{status:"in_progress",
   requirements:[{title:"CAN review",blocking:true,status:"needs_can"}]})[0]!;
  expect(step.evidence).toContain("1 recorded blocking");
 });
 it("links staffed sections to authoritative first-classroom review",()=>{
  const step=guidedSchoolJourney({...program,counts:{...program.counts,
   sections:1,publishedSections:1,staffedSections:1}},null).find(step=>step.key==="instruction")!;
  expect(step.state).toBe("review");
  expect(step.nextAction).toContain("first-classroom readiness");
  expect(step.href).toBe("/operations/launch/program");
 });
 it("keeps missing classroom configuration actionable",()=>{
  const step=guidedSchoolJourney(program,null).find(step=>step.key==="instruction")!;
  expect(step.state).toBe("needs_attention");
  expect(step.nextAction).toContain("qualified teachers");
 });
 it("gives operators current work instead of development acceptance instructions",()=>{
  const step=guidedSchoolJourney(program,null).find(step=>step.key==="operations")!;
  expect(step.nextAction).toContain("Site Today");
  expect(step.evidence).toContain("school-opening authority");
  expect(step.evidence).not.toContain("browser");
 });
});


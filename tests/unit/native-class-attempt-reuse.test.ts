import {readFileSync} from "node:fs";
import {describe,expect,it,vi} from "vitest";

vi.mock("drizzle-orm",()=>({eq:vi.fn(),and:vi.fn(),isNull:vi.fn()}));
vi.mock("@/db/canonical-v301",()=>({
 canonicalClassEnrollments:{id:"enrollment.id",status:"enrollment.status",courseAttemptId:"enrollment.attempt"},
 learnerCourseAttempts:{id:"attempt.id",classEnrollmentId:"attempt.enrollment"},
}));
import {createInitialNativeClassAttempt,withdrawNativeClassAttempts} from "@/modules/classes/native-class-attempt.server";

type Tx=Parameters<typeof createInitialNativeClassAttempt>[0];
const source={deploymentId:"deployment",adoptionId:"adoption",offeringVersionId:"offering",courseVersionId:"course"};
const enrollment={id:"enrollment",courseAttemptId:"initial"};
const initial={...source,id:"initial",classEnrollmentId:enrollment.id,enrollmentId:null,noncreditRegistrationId:null,sectionId:null,status:"active"};
function fixture(rows:Record<string,unknown>[]=[],linked=true){
 const forUpdate=vi.fn(async()=>rows);
 const where=vi.fn(()=>({for:forUpdate,returning:async()=>linked?[{id:enrollment.id}]:[]}));
 const set=vi.fn(()=>({where}));
 const values=vi.fn(()=>({returning:async()=>[{id:"initial"}]}));
 const select=vi.fn(()=>({from:()=>({where})}));
 const insert=vi.fn(()=>({values}));
 const update=vi.fn(()=>({set}));
 const tx={select,insert,update} as unknown as Tx;
 return {tx,forUpdate,where,set,values,select,insert,update};
}
describe("shared native Class Course Attempt transaction",()=>{
 it("creates the exact initial source and reciprocal pointer",async()=>{
  const f=fixture();
  expect(await createInitialNativeClassAttempt(f.tx,enrollment.id,source)).toEqual({id:"initial"});
  expect(f.values).toHaveBeenCalledWith({...source,classEnrollmentId:enrollment.id,enrollmentId:null,noncreditRegistrationId:null,sectionId:null,attemptNo:1,status:"active"});
  expect(f.set).toHaveBeenCalledWith({courseAttemptId:"initial"});
 });
 it("rejects a missing or already-linked active enrollment",async()=>{
  const f=fixture([],false);
  await expect(createInitialNativeClassAttempt(f.tx,enrollment.id,source)).rejects.toThrow("new active Class Enrollment");
 });
 it("withdraws all active retakes and preserves history",async()=>{
  const f=fixture([initial,{...initial,id:"retake"},{...initial,id:"historical",status:"completed"}]);
  expect(await withdrawNativeClassAttempts(f.tx,enrollment,source)).toEqual(["initial","retake"]);
  expect(f.forUpdate).toHaveBeenCalledWith("update");
  expect(f.set).toHaveBeenCalledTimes(2);
  expect(f.set).toHaveBeenCalledWith({status:"withdrawn"});
 });
 it("rejects every malformed live attempt before making any change",async()=>{
  const f=fixture([initial,{...initial,id:"retake",courseVersionId:"different"}]);
  await expect(withdrawNativeClassAttempts(f.tx,enrollment,source)).rejects.toThrow();
  expect(f.update).not.toHaveBeenCalled();
 });
 it("rejects direct exit of Course-owned placement, including historical rows",async()=>{
  const f=fixture([initial,{...initial,id:"historical",status:"completed",noncreditRegistrationId:"registration"}]);
  await expect(withdrawNativeClassAttempts(f.tx,enrollment,source)).rejects.toThrow("Withdraw the Course registration");
  expect(f.update).not.toHaveBeenCalled();
 });
 it("rejects missing, stale and completed selected pointers",async()=>{
  for(const rows of [[],[{...initial,id:"other"}],[{...initial,status:"completed"}]]){
   const f=fixture(rows);
   await expect(withdrawNativeClassAttempts(f.tx,enrollment,source)).rejects.toThrow();
   expect(f.update).not.toHaveBeenCalled();
  }
 });
 it("routes all initial native writes and exit commands through the shared service",()=>{
  const read=(name:string)=>readFileSync("src/modules/classes/"+name+".functions.ts","utf8");
  for(const name of ["native-class-enrollment","native-class-assignment","native-class-guardian-enrollment","native-class-transfers"]){
   const code=read(name);
   expect(code).toContain("await createInitialNativeClassAttempt(");
   expect(code).not.toContain("tx.insert(learnerCourseAttempts)");
  }
  for(const name of ["native-class-lifecycle","native-class-guardian-enrollment","native-class-transfers"]){
   const code=read(name);
   expect(code.indexOf("await withdrawNativeClassAttempts(")).toBeGreaterThan(0);
   expect(code.indexOf("await tx.update(canonicalClassEnrollments)",code.indexOf("await withdrawNativeClassAttempts("))).toBeGreaterThan(code.indexOf("await withdrawNativeClassAttempts("));
   expect(code).not.toContain("await tx.update(learnerCourseAttempts)");
  }
  const placement=readFileSync("src/modules/enrollment/course-class-placement.server.ts","utf8");
  expect(placement).not.toContain("createInitialNativeClassAttempt(");
  expect(placement).not.toContain("tx.insert(learnerCourseAttempts)");
 });
});

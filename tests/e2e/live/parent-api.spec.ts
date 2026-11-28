import {test,expect,type BrowserContext} from "@playwright/test";
import {z} from "zod";
import {authenticateQaActor,qaSession} from "../helpers/pilot-standard-access";
import {pilotRpcPage,pilotRpc as rpc,expectPilotDenial as deny} from "../helpers/pilot-governed-rpc";

const uuid=z.string().uuid();
const actor=z.object({
 email:z.string().email().refine(v=>v===v.toLowerCase()&&v.endsWith(".test")),
 grantId:uuid,organizationId:uuid,
 schoolChildren:z.array(uuid),nativeChildren:z.array(uuid),
}).strict().refine(a=>a.schoolChildren.length+a.nativeChildren.length>0,
 "Each parent must have at least one independently reviewed child fixture");
const fixture=z.object({parents:z.array(actor).length(2),coverage:z.enum(["school-only","school-and-community"])}).strict()
 .refine(f=>f.parents[0]!.email!==f.parents[1]!.email &&
  f.parents[0]!.grantId!==f.parents[1]!.grantId &&
  f.parents[0]!.schoolChildren.length>0 && f.parents[1]!.schoolChildren.length>0 &&
  (f.coverage==="school-only"?f.parents.every(p=>p.nativeChildren.length===0):f.parents.every(p=>p.nativeChildren.length>0)) &&
  f.parents.every(p=>p.nativeChildren.every(c=>!f.parents.some(q=>q!==p&&q.nativeChildren.includes(c)))) &&
  f.parents.every(p=>p.schoolChildren.every(c=>!f.parents.some(q=>q!==p&&q.schoolChildren.includes(c)))),
 "Use two distinct parents with disjoint nonempty school child fixtures")
 .parse(JSON.parse(process.env.CAN_PARENT_QA_JSON??"{}"));
const children=z.object({children:z.array(z.object({studentPersonId:uuid}))});
const students=z.object({students:z.array(z.object({studentPersonId:uuid}))});
const native=z.array(z.object({learnerPersonId:uuid}));
const nativeEnrollments=z.array(z.object({learnerPersonId:uuid}));
const attendance=z.object({absences:z.array(z.object({studentPersonId:uuid,canSubmitExcuse:z.boolean()}))});

test("ordinary parent sessions isolate academic and family API reads ("+fixture.coverage+")",async({browser})=>{
 const contexts:BrowserContext[]=[];
 try{
  const anonymous=await browser.newContext();contexts.push(anonymous);
  const publicPage=await pilotRpcPage(anonymous);
  await deny(publicPage,"familyHome","getFamilyHome",undefined,["AUTHENTICATION_REQUIRED"]);
  await deny(publicPage,"familyAcademics","getGuardianStudents",undefined,["AUTHENTICATION_REQUIRED"]);
  await deny(publicPage,"familyNative","getMyNativeGuardianLearners",undefined,["AUTHENTICATION_REQUIRED"]);
  const persons=new Set<string>();
  for(const parent of fixture.parents){
   const context=await browser.newContext();contexts.push(context);
   const session=await authenticateQaActor(context,parent.email);
   const grant=session.grants.find(g=>g.id===parent.grantId);
   expect(grant).toMatchObject({role:"guardian",organizationId:parent.organizationId});
   if(!grant)throw Error("Existing ordinary guardian membership required");
   expect(persons.has(grant.personId)).toBe(false);persons.add(grant.personId);
   if(session.activeGrantId!==parent.grantId){
    const switched=await context.request.post("http://localhost:5183/access/session",{
     headers:{Origin:"http://localhost:5183"},data:{grantId:parent.grantId}});
    expect(switched.ok()).toBe(true);
   }
   expect((await qaSession(context)).activeGrantId).toBe(parent.grantId);
   const page=await pilotRpcPage(context);
   const home=children.parse(await rpc(page,"familyHome","getFamilyHome"));
   expect(home.children.map(c=>c.studentPersonId).sort()).toEqual([...parent.schoolChildren].sort());
   const picker=students.parse(await rpc(page,"familyAcademics","getGuardianStudents"));
   expect(picker.students.map(c=>c.studentPersonId).sort()).toEqual([...parent.schoolChildren].sort());
   for(const studentPersonId of parent.schoolChildren)
    expect(await rpc(page,"familyAcademics","getGuardianAssignments",{studentPersonId})).toHaveProperty("assignments");
   const other=fixture.parents.find(p=>p.email!==parent.email)!;
   for(const studentPersonId of other.schoolChildren)
    await deny(page,"familyAcademics","getGuardianAssignments",{studentPersonId});
   const marks=attendance.parse(await rpc(page,"familyAttendance","listGuardianEffectiveAbsences",{}));
   expect(marks.absences.every(m=>parent.schoolChildren.includes(m.studentPersonId))).toBe(true);
   expect(await rpc(page,"familyHome","getGuardianNeedsYou")).toHaveProperty("items");
   expect(await rpc(page,"familyApplications","getGuardianFamilyApplicationWorkspace")).toHaveProperty("applications");
   const learners=native.parse(await rpc(page,"familyNative","getMyNativeGuardianLearners"));
   expect(learners.map(c=>c.learnerPersonId).sort()).toEqual([...parent.nativeChildren].sort());
   const approvals=native.parse(await rpc(page,"familyNative","getMyNativeGuardianClassApprovals"));
   expect(approvals.every(c=>parent.nativeChildren.includes(c.learnerPersonId))).toBe(true);
   const history=nativeEnrollments.parse(await rpc(page,"familyNative","getMyNativeGuardianClassEnrollments"));
   expect(history.every(c=>parent.nativeChildren.includes(c.learnerPersonId))).toBe(true);
  }
 }finally{await Promise.all(contexts.map(c=>c.close()));}
});

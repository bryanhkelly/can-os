import {test,expect,type BrowserContext,type Page} from "@playwright/test";
import {randomUUID} from "node:crypto";
import {neon} from "@neondatabase/serverless";
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
const staff=z.object({email:z.string().email().refine(v=>v===v.toLowerCase()&&v.endsWith(".test")),
 grantId:uuid,role:z.enum(["site_admin","registrar","app_admin"])}).strict();
const mutation=z.object({attestation:z.literal("fresh-synthetic-fixture"),parentEmail:z.string().email(),
 relationshipId:uuid,learnerPersonId:uuid,classOfferingVersionId:uuid,
 reviewer:staff,creditMode:z.enum(["audit","not_applicable"]),
 revokeBy:staff.optional()}).strict();
const fixture=z.object({parents:z.array(actor).length(2),coverage:z.enum(["school-only","school-and-community"]),
 mutation:mutation.optional()}).strict()
 .refine(f=>f.parents[0]!.email!==f.parents[1]!.email &&
  f.parents[0]!.grantId!==f.parents[1]!.grantId &&
  f.parents[0]!.schoolChildren.length>0 && f.parents[1]!.schoolChildren.length>0 &&
  (f.coverage==="school-only"?f.parents.every(p=>p.nativeChildren.length===0):f.parents.every(p=>p.nativeChildren.length>0)) &&
  f.parents.every(p=>p.nativeChildren.every(c=>!f.parents.some(q=>q!==p&&q.nativeChildren.includes(c)))) &&
  f.parents.every(p=>p.schoolChildren.every(c=>!f.parents.some(q=>q!==p&&q.schoolChildren.includes(c)))) &&
  (!f.mutation||f.coverage==="school-and-community"&&f.parents.some(p=>p.email===f.mutation!.parentEmail&&p.nativeChildren.includes(f.mutation!.learnerPersonId)&&p.schoolChildren.includes(f.mutation!.learnerPersonId))&&f.mutation.reviewer.role!=="app_admin"&&(!f.mutation.revokeBy||f.mutation.revokeBy.role==="app_admin")),
 "Use two distinct parents with disjoint nonempty school child fixtures")
 .parse(JSON.parse(process.env.CAN_PARENT_QA_JSON??"{}"));
const children=z.object({children:z.array(z.object({studentPersonId:uuid}))});
const students=z.object({students:z.array(z.object({studentPersonId:uuid}))});
const native=z.array(z.object({learnerPersonId:uuid}));
const nativeEnrollments=z.array(z.object({learnerPersonId:uuid}));
const attendance=z.object({absences:z.array(z.object({studentPersonId:uuid,canSubmitExcuse:z.boolean()}))});

test("ordinary parent sessions isolate academic and family API reads ("+fixture.coverage+")",async({browser})=>{
 const contexts:BrowserContext[]=[];
 const pages=new Map<string,Page>();
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
   const page=await pilotRpcPage(context);pages.set(parent.email,page);
   const homeRaw=await rpc(page,"familyHome","getFamilyHome");
   const home=children.parse(homeRaw);
   const community=z.object({community:z.object({available:z.literal(true),learners:native})}).parse(homeRaw);
   expect(community.community.learners.map(c=>c.learnerPersonId).sort()).toEqual([...parent.nativeChildren].sort());
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
  if(fixture.mutation){
   const m=fixture.mutation,own=pages.get(m.parentEmail)!;
   const other=fixture.parents.find(p=>p.email!==m.parentEmail)!;
   const foreign=pages.get(other.email)!;
   // The dedicated branch may contain copies of actual records. This
   // preflight only checks fixture ownership; every business write is RPC.
   const sql=neon(process.env.TEST_DATABASE_URL!);
   const branch="br-solitary-art-arun91gj";
   const [safe]=await sql`SELECT count(*)::int AS count FROM public.guardian_relationships g
    JOIN public.people child ON child.id=g.student_person_id
    JOIN public.people parent ON parent.id=g.guardian_person_id
    JOIN public.access_accounts a ON a.person_id=parent.id
    JOIN public.class_offering_versions v ON v.id=${m.classOfferingVersionId}::uuid
    JOIN public.classes c ON c.id=v.class_id
    JOIN public.organizations o ON o.id=c.operating_organization_id
    WHERE g.id=${m.relationshipId}::uuid AND child.id=${m.learnerPersonId}::uuid
     AND a.email_normalized=${m.parentEmail}
     AND child.metadata->>'qa_only'='true' AND child.metadata->>'intended_branch'=${branch}
     AND parent.metadata->>'qa_only'='true' AND parent.metadata->>'intended_branch'=${branch}
     AND o.metadata->>'qa_only'='true' AND o.metadata->>'intended_branch'=${branch}`;
   expect(safe?.count).toBe(1);
   async function staffPage(a:z.infer<typeof staff>){
    const context=await browser.newContext();contexts.push(context);
    const initial=await authenticateQaActor(context,a.email);
    expect(initial.grants.find(g=>g.id===a.grantId)).toMatchObject({role:a.role});
    if(initial.activeGrantId!==a.grantId)expect((await context.request.post("http://localhost:5183/access/session",{
     headers:{Origin:"http://localhost:5183"},data:{grantId:a.grantId}})).ok()).toBe(true);
    expect((await qaSession(context)).activeGrantId).toBe(a.grantId);
    return pilotRpcPage(context);
   }
   const input={learnerPersonId:m.learnerPersonId,classOfferingVersionId:m.classOfferingVersionId,requestId:randomUUID()};
   await deny(foreign,"familyNative","requestNativeGuardianClassApproval",input);
   const request=z.object({approvalRequestId:uuid,state:z.literal("pending"),duplicate:z.boolean()})
    .parse(await rpc(own,"familyNative","requestNativeGuardianClassApproval",input));
   expect(request.duplicate).toBe(false);
   expect(await rpc(own,"familyNative","requestNativeGuardianClassApproval",input)).toMatchObject({approvalRequestId:request.approvalRequestId,duplicate:true});
   const consent={approvalRequestId:request.approvalRequestId,creditMode:m.creditMode,consentAccepted:true};
   await deny(own,"familyNative","acceptNativeGuardianClassApproval",consent);
   const decision={approvalRequestId:request.approvalRequestId,decision:"approved",reason:"Independent synthetic QA eligibility review"};
   await deny(own,"classApproval","decideNativeClassApproval",decision);
   const operator=await staffPage(m.reviewer);
   expect(await rpc(operator,"classApproval","decideNativeClassApproval",decision)).toMatchObject({state:"approved"});
   await deny(foreign,"familyNative","acceptNativeGuardianClassApproval",consent);
   const enrollment=z.object({classEnrollmentId:uuid,courseAttemptId:uuid})
    .parse(await rpc(own,"familyNative","acceptNativeGuardianClassApproval",consent));
   expect(await rpc(own,"familyNative","acceptNativeGuardianClassApproval",consent)).toEqual(enrollment);
   const history=z.array(z.object({classEnrollmentId:uuid,learnerPersonId:uuid,status:z.string()}))
    .parse(await rpc(own,"familyNative","getMyNativeGuardianClassEnrollments"));
   expect(history.find(e=>e.classEnrollmentId===enrollment.classEnrollmentId)).toMatchObject({learnerPersonId:m.learnerPersonId,status:"active"});
   await deny(foreign,"familyNative","withdrawMyGuardianNativeClassEnrollment",{classEnrollmentId:enrollment.classEnrollmentId});
   expect(await rpc(own,"familyNative","withdrawMyGuardianNativeClassEnrollment",{classEnrollmentId:enrollment.classEnrollmentId})).toMatchObject({alreadyWithdrawn:false});
   expect(await rpc(own,"familyNative","withdrawMyGuardianNativeClassEnrollment",{classEnrollmentId:enrollment.classEnrollmentId})).toMatchObject({alreadyWithdrawn:true});
   if(m.revokeBy){
    const revoke={relationshipId:m.relationshipId,reason:"Synthetic QA child-specific revocation"};
    await deny(own,"guardianReview","revokeGuardianRelationship",revoke);
    const admin=await staffPage(m.revokeBy);
    expect(await rpc(admin,"guardianReview","revokeGuardianRelationship",revoke)).toMatchObject({revoked:true});
    expect(await rpc(admin,"guardianReview","revokeGuardianRelationship",revoke)).toMatchObject({revoked:false});
    await deny(own,"familyAcademics","getGuardianAssignments",{studentPersonId:m.learnerPersonId});
    await deny(own,"familyNative","acceptNativeGuardianClassApproval",consent);
    expect(native.parse(await rpc(own,"familyNative","getMyNativeGuardianLearners")).some(x=>x.learnerPersonId===m.learnerPersonId)).toBe(false);
    const parent=fixture.parents.find(p=>p.email===m.parentEmail)!;
    expect(children.parse(await rpc(own,"familyHome","getFamilyHome")).children.map(c=>c.studentPersonId).sort())
     .toEqual(parent.schoolChildren.filter(c=>c!==m.learnerPersonId).sort());
   }
  }
 }finally{await Promise.all(contexts.map(c=>c.close()));}
});

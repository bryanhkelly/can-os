import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { roleCapabilities, type AccessContext } from "@/domain/access-context";
import type { ClassContent } from "@/domain/class-content";

type Transaction=Parameters<Parameters<Database["transaction"]>[0]>[0];
const state=vi.hoisted(()=>({tx:undefined as Transaction|undefined,actor:undefined as AccessContext|undefined}));
vi.mock("@/db/client",()=>({
 get db(){if(!state.tx)throw new Error("Curriculum tests must stay in the rollback transaction");return state.tx;},
}));
vi.mock("@tanstack/react-start",()=>({
 createServerFn:()=>({
  parse:(value:unknown)=>value,
  validator(parse:(value:unknown)=>unknown){this.parse=parse;return this;},
  handler(callback:(input:{data:unknown})=>unknown){
   return async(input?:{data:unknown})=>callback({data:this.parse(input?.data)});
  },
 }),
}));
vi.mock("@tanstack/react-start/server",()=>({getRequest:()=>new Request("http://localhost"),setResponseHeader:vi.fn()}));
vi.mock("@/modules/identity/command-context.server",()=>({
 getCommandContext:async()=>{if(!state.actor)throw new Error("Missing curriculum actor");return state.actor;},
}));
function first<T>(rows:T[]):T{const value=rows[0];if(!value)throw new Error("Missing curriculum fixture");return value;}
const integration=process.env.DATABASE_URL?describe:describe.skip;
integration("governed curriculum authoring through classroom delivery",()=>{
 it("publishes immutable releases for new sections without changing existing learning or progress",async()=>{
  const {db:database}=await vi.importActual<{db:Database}>("@/db/client");
  const s=await import("@/db/schema");
  const flow=await import("@/modules/learning/curriculum-authoring.functions");
  const {getClassWorkspace,setLessonCompletion}=await import("@/modules/learning/class-workspace.functions");
  const {provisionLaunchSection}=await import("@/modules/programs/launch-academics.functions");
  const rollback=new Error("rollback-curriculum-authoring");
  const suffix=crypto.randomUUID().slice(0,8);
  let courseId="",versionId="";
  let checked=false;
  try{
   await database.transaction(async tx=>{
    state.tx=tx;
    const org=first(await tx.insert(s.organizations).values({type:"christian_school",name:"Curriculum School",slug:`curriculum-${suffix}`}).returning());
    const site=first(await tx.insert(s.sites).values({organizationId:org.id,name:"Curriculum Site",slug:`curriculum-${suffix}`}).returning());
    const jurisdiction=first(await tx.insert(s.jurisdictions).values({code:`curriculum-${suffix}`,name:"Synthetic curriculum jurisdiction"}).returning());
    const program=first(await tx.insert(s.programs).values({organizationId:org.id,siteId:site.id,jurisdictionId:jurisdiction.id,
     type:"full_school",status:"active",name:"Curriculum Program",slug:`curriculum-${suffix}`,gradeRange:{min:"9",max:"12"},
     deliveryModel:{onsite:true},academicProviderOrganizationId:org.id,creditIssuingOrganizationId:org.id}).returning());
    const publisher=first(await tx.insert(s.people).values({legalFirstName:"Curriculum",legalLastName:"Publisher"}).returning());
    const teacher=first(await tx.insert(s.people).values({legalFirstName:"Curriculum",legalLastName:"Teacher"}).returning());
    const learner=first(await tx.insert(s.people).values({legalFirstName:"Curriculum",legalLastName:"Learner"}).returning());
    const guardian=first(await tx.insert(s.people).values({legalFirstName:"Curriculum",legalLastName:"Guardian"}).returning());
    const student=first(await tx.insert(s.studentProfiles).values({personId:learner.id,gradeLevel:"10"}).returning());
    await tx.insert(s.guardianRelationships).values({guardianPersonId:guardian.id,studentPersonId:learner.id,relationshipLabel:"parent",canViewAcademics:true});
    function act(role:"registrar"|"teacher"|"student"|"guardian",personId:string):AccessContext{
     const actor:AccessContext={actorPersonId:personId,role,accountId:crypto.randomUUID(),sessionId:crypto.randomUUID(),
      grantId:crypto.randomUUID(),capabilities:new Set(roleCapabilities[role]),
      scope:{organizationIds:[org.id],siteIds:[site.id],programIds:[program.id]}};
     state.actor=actor;return actor;
    }
    const staff=act("registrar",publisher.id);
    const scope={programId:program.id};
    expect(await flow.getCurriculumPrograms()).toEqual([]);
    await expect(flow.getCurriculumStudio({data:scope})).rejects.toThrow("explicit curriculum publisher");
    await tx.insert(s.memberships).values({personId:publisher.id,organizationId:org.id});
    const seed=readFileSync("scripts/seeds/curriculum-authoring.sql","utf8")
     .replace("BEGIN;","").replace("COMMIT;","")
     .replaceAll("f7000000-0000-4000-8000-000000000001",publisher.id)
     .replaceAll("f1000000-0000-4000-8000-000000000002",org.id)
     .replaceAll("f1000000-0000-4000-8000-000000000003",site.id)
     .replaceAll("f1000000-0000-4000-8000-000000000004",program.id);
    await tx.execute(sql.raw(seed));
    await tx.execute(sql.raw(seed));
    expect(await tx.select().from(s.courseTemplateVersions).where(eq(s.courseTemplateVersions.id,"c7200000-0000-4000-8000-000000000003"))).toHaveLength(1);
    await tx.delete(s.roleAssignments).where(eq(s.roleAssignments.id,"c7200000-0000-4000-8000-000000000001"));
    const grant=first(await tx.insert(s.roleAssignments).values({personId:publisher.id,organizationId:org.id,siteId:site.id,
     programId:program.id,roleKey:"curriculum_publisher",capabilities:["curriculum.publish"]}).returning());
    expect(await flow.getCurriculumPrograms()).toEqual([{id:program.id,name:program.name}]);
    const creation={...scope,code:`SCI-${suffix}`,title:"Evidence and Discovery",subject:"Science",requestId:crypto.randomUUID()};
    const course=await flow.createAuthoredCourse({data:creation});courseId=course.courseId;
    expect(await flow.createAuthoredCourse({data:creation})).toEqual(course);
    await expect(flow.createAuthoredCourse({data:{...creation,title:"Conflicting title"}})).rejects.toThrow("already exists");
    const request={...scope,courseId,requestId:crypto.randomUUID()};
    const draft=await flow.startCurriculumDraft({data:request});versionId=draft.versionId;
    expect(await flow.startCurriculumDraft({data:request})).toEqual(draft);
    await expect(flow.startCurriculumDraft({data:{...request,requestId:crypto.randomUUID()}})).rejects.toThrow("already has a draft");
    const readRelease=async(id:string)=>first(first((await flow.getCurriculumStudio({data:scope})).courses.filter(row=>row.id===courseId)).releases.filter(row=>row.id===id));
    const initial=await readRelease(versionId);
    const {createAcademicTimeFixture}=await import("./helpers/academic-time");
    const time=await createAcademicTimeFixture({organizationId:org.id,siteId:site.id,programId:program.id,suffix});
    const provision={programId:program.id,termId:time.term.id,courseTemplateVersionId:versionId,code:`A-${suffix}`,title:"Science A"};
    await expect(provisionLaunchSection({data:provision})).rejects.toThrow("Choose a published course");
    const publication={...scope,versionId,expectedRevision:initial.revision,confirmed:true as const,reason:"Reviewed foundational science curriculum for release."};
    await expect(flow.publishAuthoredCurriculum({data:publication})).rejects.toThrow("syllabus");
    const content:ClassContent={version:1,syllabus:"Investigate evidence through reading and practice.",
     modules:[{id:"evidence",title:"Evidence",lessons:[{id:"observe",title:"Observation",body:"Observe closely before drawing conclusions.",resources:[]}]}],
     resources:[{id:"library",title:"Science library",url:"https://www.loc.gov/"}]};
    const save={...scope,versionId,expectedRevision:initial.revision,content};
    const saved=await flow.saveAuthoredCurriculum({data:save});
    expect(await flow.saveAuthoredCurriculum({data:save})).toEqual(saved);
    expect((await readRelease(versionId)).revision).toBe(saved.revision);
    await expect(flow.saveAuthoredCurriculum({data:{...save,content:{...content,syllabus:"A stale editor tries to replace newer content."}}})).rejects.toThrow("draft changed");
    await expect(flow.publishAuthoredCurriculum({data:publication})).rejects.toThrow("draft changed");
    await expect(flow.publishAuthoredCurriculum({data:{...publication,expectedRevision:saved.revision,confirmed:false}})).rejects.toThrow();
    const publish={...publication,expectedRevision:saved.revision};
    const invalidSection=first(await tx.insert(s.sections).values({programId:program.id,siteId:site.id,termId:time.term.id,
     courseTemplateVersionId:versionId,code:`DRAFT-${suffix}`,title:"Invalid historical draft reference"}).returning());
    await expect(flow.publishAuthoredCurriculum({data:publish})).rejects.toThrow("section already references this draft");
    await tx.delete(s.sections).where(eq(s.sections.id,invalidSection.id));
    await flow.publishAuthoredCurriculum({data:publish});
    await flow.publishAuthoredCurriculum({data:publish});
    await expect(flow.publishAuthoredCurriculum({data:{...publish,reason:"Different publication reason on retry"}})).rejects.toThrow("different input");
    await expect(flow.saveAuthoredCurriculum({data:{...save,expectedRevision:saved.revision}})).rejects.toThrow("immutable");
    const pinned=first(await tx.select().from(s.courseTemplateVersions).where(eq(s.courseTemplateVersions.id,versionId)));
    const oldSection=await provisionLaunchSection({data:provision});
    await tx.insert(s.sectionTeachers).values({sectionId:oldSection.sectionId,personId:teacher.id});
    await tx.insert(s.enrollments).values({studentProfileId:student.id,kind:"section",status:"active",organizationId:org.id,
     programId:program.id,schoolYearId:time.schoolYear.id,sectionId:oldSection.sectionId});
    const learnerActor=act("student",learner.id);
    expect((await getClassWorkspace({data:{sectionId:oldSection.sectionId}})).content).toEqual(content);
    await setLessonCompletion({data:{sectionId:oldSection.sectionId,versionId,lessonId:"observe",completed:true}});
    state.actor=staff;
    const nextRequest={...request,requestId:crypto.randomUUID(),sourceVersionId:versionId};
    const next=await flow.startCurriculumDraft({data:nextRequest});
    const copied=await readRelease(next.versionId);
    expect(copied.content).toEqual(content);
    const revised:ClassContent={...content,syllabus:"New release syllabus.",modules:content.modules.map(module=>({...module,
     lessons:module.lessons.map(lesson=>({...lesson,body:"New release reading, intentionally different."}))}))};
    const nextSaved=await flow.saveAuthoredCurriculum({data:{...scope,versionId:next.versionId,expectedRevision:copied.revision,content:revised}});
    state.actor=learnerActor;
    const duringDraft=await getClassWorkspace({data:{sectionId:oldSection.sectionId}});
    expect(duringDraft.content).toEqual(content);
    expect(duringDraft.progress).toHaveLength(1);
    await expect(flow.getCurriculumStudio({data:scope})).rejects.toThrow();
    state.actor=staff;
    await flow.publishAuthoredCurriculum({data:{...publish,versionId:next.versionId,expectedRevision:nextSaved.revision}});
    const newSection=await provisionLaunchSection({data:{...provision,courseTemplateVersionId:next.versionId,code:`B-${suffix}`,title:"Science B"}});
    await tx.insert(s.sectionTeachers).values({sectionId:newSection.sectionId,personId:teacher.id});
    await tx.insert(s.enrollments).values({studentProfileId:student.id,kind:"section",status:"active",organizationId:org.id,
     programId:program.id,schoolYearId:time.schoolYear.id,sectionId:newSection.sectionId});
    state.actor=learnerActor;
    const original=await getClassWorkspace({data:{sectionId:oldSection.sectionId}});
    expect(original.content).toEqual(content);expect(original.progress).toHaveLength(1);
    const latest=await getClassWorkspace({data:{sectionId:newSection.sectionId}});
    expect(latest.content).toEqual(revised);expect(latest.progress).toEqual([]);
    act("guardian",guardian.id);
    expect((await getClassWorkspace({data:{sectionId:newSection.sectionId,studentPersonId:learner.id}})).content).toEqual(revised);
    act("teacher",teacher.id);
    expect((await getClassWorkspace({data:{sectionId:newSection.sectionId}})).content).toEqual(revised);
    await expect(flow.saveAuthoredCurriculum({data:{...save,versionId:next.versionId}})).rejects.toThrow();
    state.actor=staff;
    for(const scope of [{...staff.scope,programIds:[]},{...staff.scope,siteIds:[]},{...staff.scope,organizationIds:[]}]){
     state.actor={...staff,scope};
     await expect(flow.getCurriculumStudio({data:{programId:program.id}})).rejects.toThrow();
    }
    state.actor=staff;
    const foreign=first(await tx.insert(s.organizations).values({type:"christian_school",name:"Foreign owner",slug:`foreign-${suffix}`}).returning());
    const foreignCourse=first(await tx.insert(s.courseTemplates).values({owningOrganizationId:foreign.id,code:suffix,title:"Foreign curriculum",subject:"Science"}).returning());
    await expect(flow.startCurriculumDraft({data:{...request,courseId:foreignCourse.id,requestId:crypto.randomUUID()}})).rejects.toThrow("owning organization");
    // A third-party publisher is NOT the school's academic provider.
    // A published pack, active entitlement, and program adoption must all exist.
    const externalVersion=first(await tx.insert(s.courseTemplateVersions).values({
      courseTemplateId:foreignCourse.id,version:1,status:"published",publishedAt:new Date(),
      curriculum:{learning:content},
    }).returning());
    const programIdentity={id:program.id,organizationId:org.id,academicProviderOrganizationId:org.id};
    const {listLaunchEligibleCourses,assertLaunchEligibleCourse}=await import("@/modules/programs/launch-curriculum-eligibility.server");
    await expect(assertLaunchEligibleCourse(programIdentity,externalVersion.id,tx)).rejects.toThrow("Choose a published course");
    const pack=first(await tx.insert(s.curriculumPacks).values({
      publisherOrganizationId:foreign.id,slug:`pack-${suffix}`,name:"Foreign Published Science",
      description:"Third-party published curriculum",visibility:"public",licenseCode:"CC-BY-4.0",
    }).returning());
    const packVersion=first(await tx.insert(s.curriculumPackVersions).values({
      packId:pack.id,version:1,status:"published",publishedAt:new Date(),
    }).returning());
    await tx.insert(s.curriculumPackItems).values({
      packVersionId:packVersion.id,courseTemplateVersionId:externalVersion.id,position:1,
    });
    const entitlement=first(await tx.insert(s.curriculumEntitlements).values({
      organizationId:org.id,packId:pack.id,termsAcceptedAt:new Date(),
      acceptedByPersonId:publisher.id,
    }).returning());
    await expect(assertLaunchEligibleCourse(programIdentity,externalVersion.id,tx)).rejects.toThrow("Choose a published course");
    const adoption=first(await tx.insert(s.curriculumAdoptions).values({
      organizationId:org.id,programId:program.id,siteId:site.id,packId:pack.id,
      packVersionId:packVersion.id,adoptedByPersonId:publisher.id,
    }).returning());
    expect((await listLaunchEligibleCourses(programIdentity,tx)).some(c=>c.versionId===externalVersion.id)).toBe(true);
    const thirdParty=await provisionLaunchSection({data:{
      ...provision,courseTemplateVersionId:externalVersion.id,code:`EXT-${suffix}`,title:"Licensed Science",
    }});
    expect(first(await tx.select().from(s.sections).where(eq(s.sections.id,thirdParty.sectionId))).courseTemplateVersionId).toBe(externalVersion.id);
    await tx.update(s.curriculumEntitlements).set({status:"revoked"}).where(eq(s.curriculumEntitlements.id,entitlement.id));
    await expect(provisionLaunchSection({data:{
      ...provision,courseTemplateVersionId:externalVersion.id,code:`DENY-${suffix}`,title:"Denied Science",
    }})).rejects.toThrow("Choose a published course");
    await tx.update(s.curriculumEntitlements).set({status:"active"}).where(eq(s.curriculumEntitlements.id,entitlement.id));
    await tx.update(s.curriculumAdoptions).set({status:"inactive"}).where(eq(s.curriculumAdoptions.id,adoption.id));
    await expect(assertLaunchEligibleCourse(programIdentity,externalVersion.id,tx)).rejects.toThrow("Choose a published course");

    await tx.update(s.people).set({active:false}).where(eq(s.people.id,publisher.id));
    await expect(flow.getCurriculumStudio({data:scope})).rejects.toThrow("explicit curriculum publisher");
    await tx.update(s.people).set({active:true}).where(eq(s.people.id,publisher.id));
    await tx.delete(s.memberships).where(and(eq(s.memberships.personId,publisher.id),eq(s.memberships.organizationId,org.id)));
    await expect(flow.getCurriculumStudio({data:scope})).rejects.toThrow("explicit curriculum publisher");
    await tx.insert(s.memberships).values({personId:publisher.id,organizationId:org.id});
    await tx.delete(s.roleAssignments).where(eq(s.roleAssignments.id,grant.id));
    await expect(flow.publishAuthoredCurriculum({data:publish})).rejects.toThrow("explicit curriculum publisher");
    expect(await flow.getCurriculumPrograms()).toEqual([]);
    expect(await tx.select().from(s.courseTemplateVersions).where(eq(s.courseTemplateVersions.id,versionId))).toEqual([pinned]);
    expect(first(await tx.select().from(s.sections).where(eq(s.sections.id,oldSection.sectionId))).courseTemplateVersionId).toBe(versionId);
    expect(await tx.select().from(s.auditEvents).where(and(eq(s.auditEvents.resourceId,versionId),eq(s.auditEvents.action,"curriculum.publish")))).toHaveLength(1);
    expect(await tx.select().from(s.auditEvents).where(and(eq(s.auditEvents.resourceId,versionId),eq(s.auditEvents.action,"curriculum.draft.save")))).toHaveLength(1);
    expect(await tx.select().from(s.domainEvents).where(and(eq(s.domainEvents.aggregateId,versionId),eq(s.domainEvents.eventType,"CurriculumPublished")))).toHaveLength(1);
    checked=true;throw rollback;
   });
  }catch(error){if(error!==rollback)throw error;}
  finally{state.tx=undefined;state.actor=undefined;}
  expect(checked).toBe(true);
  expect(await database.select().from(s.courseTemplates).where(eq(s.courseTemplates.id,courseId))).toEqual([]);
  expect(await database.select().from(s.courseTemplateVersions).where(eq(s.courseTemplateVersions.id,versionId))).toEqual([]);
  expect(await database.select().from(s.auditEvents).where(eq(s.auditEvents.resourceId,versionId))).toEqual([]);
  expect(await database.select().from(s.courseTemplateVersions).where(eq(s.courseTemplateVersions.id,"c7200000-0000-4000-8000-000000000003"))).toEqual([]);
  expect(await database.select().from(s.roleAssignments).where(eq(s.roleAssignments.id,"c7200000-0000-4000-8000-000000000001"))).toEqual([]);
 },180_000);
});

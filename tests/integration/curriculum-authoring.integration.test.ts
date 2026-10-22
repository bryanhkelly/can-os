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
    // A targeted lesson edit preserves the rest of the course and published
    // classroom's pinned v1, while advancing the course-draft revision.
    const lesson=first(revised.modules[0]!.lessons);
    const editedLesson={...lesson,title:"Observation with revised feedback"};
    const lessonSaved=await flow.saveAuthoredLesson({data:{...scope,versionId:next.versionId,
     expectedRevision:nextSaved.revision,moduleId:revised.modules[0]!.id,lessonId:lesson.id,lesson:editedLesson}});
    expect(lessonSaved.changed).toBe(true);
    await expect(flow.saveAuthoredLesson({data:{...scope,versionId:next.versionId,
     expectedRevision:nextSaved.revision,moduleId:revised.modules[0]!.id,lessonId:lesson.id,lesson:editedLesson}})
    ).rejects.toThrow("draft changed");
    revised.modules[0]!.lessons[0]=editedLesson;
    state.actor=learnerActor;
    const duringDraft=await getClassWorkspace({data:{sectionId:oldSection.sectionId}});
    expect(duringDraft.content).toEqual(content);
    expect(duringDraft.progress).toHaveLength(1);
    await expect(flow.getCurriculumStudio({data:scope})).rejects.toThrow();
    state.actor=staff;
    await flow.publishAuthoredCurriculum({data:{...publish,versionId:next.versionId,expectedRevision:lessonSaved.revision}});
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
    // Compose a pack through the same scoped publisher server functions as the UI.
    const packApi=await import("@/modules/learning/publisher-pack-authoring.functions");
    const packRequest={programId:program.id,slug:`sciences-${suffix}`,name:"Published Science Pack",
     description:"Science course release available for institutional adoption.",
     visibility:"public" as const,licenseCode:"CC-BY-4.0" as const,requestId:crypto.randomUUID()};
    const authoredPack=await packApi.createAuthoredPublisherPack({data:packRequest});
    expect((await packApi.createAuthoredPublisherPack({data:packRequest})).packId).toBe(authoredPack.packId);
    const studioBefore=await packApi.getPublisherPackStudio({data:{programId:program.id}});
    const draftPack=first(first(studioBefore.packs.filter(p=>p.id===authoredPack.packId)).releases);
    expect(draftPack.status).toBe("draft");
    await expect(packApi.publishAuthoredPublisherPack({data:{
     programId:program.id,versionId:authoredPack.versionId,
     expectedRevision:draftPack.revision,reason:"Publisher reviewed course selection.",confirmed:true,
    }})).rejects.toThrow("Select between");
    const savedPack=await packApi.saveAuthoredPublisherPack({data:{
     programId:program.id,versionId:authoredPack.versionId,
     expectedRevision:draftPack.revision,courseVersionIds:[versionId,next.versionId],
    }}).catch(async error=>{
     // Both versions refer to the SAME course and may never share a pack.
     if(!(error instanceof Error)||!error.message.includes("one published release"))throw error;
     return packApi.saveAuthoredPublisherPack({data:{
      programId:program.id,versionId:authoredPack.versionId,
      expectedRevision:draftPack.revision,courseVersionIds:[next.versionId],
     }});
    });
    await expect(packApi.saveAuthoredPublisherPack({data:{
     programId:program.id,versionId:authoredPack.versionId,
     expectedRevision:draftPack.revision,courseVersionIds:[versionId],
    }})).rejects.toThrow("draft changed");
    await packApi.publishAuthoredPublisherPack({data:{
     programId:program.id,versionId:authoredPack.versionId,
     expectedRevision:savedPack.revision,reason:"Publisher approved this immutable pack release.",
     confirmed:true,
    }});
    await expect(packApi.saveAuthoredPublisherPack({data:{
     programId:program.id,versionId:authoredPack.versionId,
     expectedRevision:savedPack.revision,courseVersionIds:[versionId],
    }})).rejects.toThrow("immutable");
    const nextPack=await packApi.startPublisherPackDraft({data:{
     programId:program.id,packId:authoredPack.packId,requestId:crypto.randomUUID(),
    }});
    const secondPackDraft=first(first((await packApi.getPublisherPackStudio({data:{programId:program.id}})
     ).packs.filter(p=>p.id===authoredPack.packId)).releases.filter(r=>r.id===nextPack.versionId));
    expect(secondPackDraft.courseVersionIds).toEqual([next.versionId]);

    // Genuine cross-organization lifecycle: separate publisher authors a course,
    // school installs a published pack and adopts it, assigned teacher creates
    // work, enrolled student completes the lesson and submits a response.
    const foreign=first(await tx.insert(s.organizations).values({
      type:"christian_school",name:"Independent Curriculum Publisher",slug:`publisher-${suffix}`,
    }).returning());
    const foreignSite=first(await tx.insert(s.sites).values({
      organizationId:foreign.id,name:"Publisher Authoring Site",slug:`publisher-${suffix}`,
    }).returning());
    const foreignProgram=first(await tx.insert(s.programs).values({
      organizationId:foreign.id,siteId:foreignSite.id,jurisdictionId:jurisdiction.id,
      type:"full_school",status:"active",name:"Publisher Academic Program",slug:`publisher-${suffix}`,
      gradeRange:{min:"9",max:"12"},deliveryModel:{onsite:true},
      academicProviderOrganizationId:foreign.id,creditIssuingOrganizationId:foreign.id,
    }).returning());
    const foreignPerson=first(await tx.insert(s.people).values({
      legalFirstName:"Independent",legalLastName:"Publisher",
    }).returning());
    await tx.insert(s.memberships).values({personId:foreignPerson.id,organizationId:foreign.id});
    await tx.insert(s.roleAssignments).values({
      personId:foreignPerson.id,organizationId:foreign.id,siteId:foreignSite.id,
      programId:foreignProgram.id,roleKey:"curriculum_publisher",capabilities:["curriculum.publish"],
    });
    const publisherActor:AccessContext={...staff,actorPersonId:foreignPerson.id,
      accountId:crypto.randomUUID(),sessionId:crypto.randomUUID(),grantId:crypto.randomUUID(),
      scope:{organizationIds:[foreign.id],siteIds:[foreignSite.id],programIds:[foreignProgram.id]}};
    state.actor=publisherActor;
    const foreignScope={programId:foreignProgram.id};
    const foreignCourse=await flow.createAuthoredCourse({data:{
      ...foreignScope,code:`MATH-${suffix}`,title:"Third-Party Algebra I",subject:"Mathematics",
      requestId:crypto.randomUUID(),
    }});
    state.actor=staff;
    await expect(flow.startCurriculumDraft({data:{
      ...request,courseId:foreignCourse.courseId,requestId:crypto.randomUUID(),
    }})).rejects.toThrow("owning organization");
    state.actor=publisherActor;
    const foreignDraft=await flow.startCurriculumDraft({data:{
      ...foreignScope,courseId:foreignCourse.courseId,requestId:crypto.randomUUID(),
    }});
    const foreignFirst=first(first((await flow.getCurriculumStudio({data:foreignScope}))
      .courses.filter(c=>c.id===foreignCourse.courseId)).releases);
    const thirdPartyContent:ClassContent={...content,syllabus:"Publisher-owned algebra curriculum for adopting schools.",
      modules:[{id:"algebra1-u01",title:"Algebra I: Equations",lessons:[{
        id:"algebra1-equations",title:"Solve Equations",body:"Solve equations and justify the inverse operations.",
        resources:[],activities:[{id:"algebra1-equations-launch",kind:"guided_practice",
          title:"Explain the solution",instructions:"Solve 3x + 5 = 20; check by substitution.",
          evidence:"teacher_review",estimatedMinutes:20}],
      }]}]};
    const protectedGuide={version:1 as const,visibility:"teacher_only" as const,
      courseCode:`MATH-${suffix}`,units:[{unitId:"algebra1-u01",
        reviewStatus:"draft" as const,teacherOverview:"Check algebra reasoning during instruction.",
        lessons:[{lessonId:"algebra1-equations",
          preparation:"Prepare a balanced-scale example of solving equations.",
          workedAnswers:[{prompt:"Solve 3x + 5 = 20.",answer:"Subtract five, divide by three, x=5. Check 3(5)+5=20."}],
          misconceptions:["Students may divide before subtracting the constant."],
          interventions:["Draw a balanced scale and undo addition before multiplication."],
          extensions:["Change the right side and justify the effect on x."]}],
        assessments:[]}]};
    const foreignSaved=await flow.saveAuthoredCurriculum({data:{
      ...foreignScope,versionId:foreignDraft.versionId,expectedRevision:foreignFirst.revision,
      content:thirdPartyContent,teacherGuides:protectedGuide,
    }});
    await flow.publishAuthoredCurriculum({data:{
      ...foreignScope,versionId:foreignDraft.versionId,expectedRevision:foreignSaved.revision,
      reason:"Publisher confirms lesson and restricted teacher guide.",confirmed:true,
    }});
    const publisherPack=await packApi.createAuthoredPublisherPack({data:{
      ...foreignScope,slug:`publisher-algebra-${suffix}`,name:"Publisher Algebra I",
      description:"Licensed publisher Algebra I course with learning activities.",
      visibility:"public",licenseCode:"CC-BY-4.0",requestId:crypto.randomUUID(),
    }});
    const draftComposition=first(first((await packApi.getPublisherPackStudio({data:foreignScope}))
      .packs.filter(p=>p.id===publisherPack.packId)).releases);
    const composed=await packApi.saveAuthoredPublisherPack({data:{
      ...foreignScope,versionId:publisherPack.versionId,expectedRevision:draftComposition.revision,
      courseVersionIds:[foreignDraft.versionId],
    }});
    await packApi.publishAuthoredPublisherPack({data:{
      ...foreignScope,versionId:publisherPack.versionId,expectedRevision:composed.revision,
      reason:"Publisher releases Algebra I pack for licensed schools.",confirmed:true,
    }});

    // Buying school registrar receives ONLY curriculum.adopt, not the
    // unrelated publisher's curriculum.publish authoring grant.
    const adopterPerson=first(await tx.insert(s.people).values({
      legalFirstName:"School",legalLastName:"Curriculum Adopter",
    }).returning());
    await tx.insert(s.memberships).values({personId:adopterPerson.id,organizationId:org.id});
    await tx.insert(s.roleAssignments).values({
      personId:adopterPerson.id,organizationId:org.id,siteId:site.id,
      programId:program.id,roleKey:"curriculum_adopter",capabilities:["curriculum.adopt"],
    });
    const adopterActor:AccessContext={...staff,actorPersonId:adopterPerson.id,
      accountId:crypto.randomUUID(),sessionId:crypto.randomUUID(),grantId:crypto.randomUUID(),
      scope:{organizationIds:[org.id],siteIds:[site.id],programIds:[program.id]}};
    state.actor=adopterActor;
    await expect(flow.getCurriculumStudio({data:scope})).rejects.toThrow("publisher");
    const marketplace=await import("@/modules/learning/curriculum-marketplace.functions");
    expect(await marketplace.getCurriculumAdopterPrograms()).toEqual([
      {id:program.id,name:program.name},
    ]);
    const market=await marketplace.getCurriculumMarketplace({data:scope});
    expect(market.canPublish).toBe(false);
    expect(market.packs.some(p=>p.id===publisherPack.packId&&p.courses.some(
      c=>c.courseVersionId===foreignDraft.versionId))).toBe(true);
    const programIdentity={id:program.id,organizationId:org.id,academicProviderOrganizationId:org.id};
    const {listLaunchEligibleCourses,assertLaunchEligibleCourse}=await import("@/modules/programs/launch-curriculum-eligibility.server");
    await expect(assertLaunchEligibleCourse(programIdentity,foreignDraft.versionId,tx))
      .rejects.toThrow("Choose a published course");
    const installed=await marketplace.installCurriculumPack({data:{
      ...scope,packId:publisherPack.packId,termsAccepted:true,
    }});
    expect(installed.installed).toBe(true);
    await expect(assertLaunchEligibleCourse(programIdentity,foreignDraft.versionId,tx))
      .rejects.toThrow("Choose a published course");
    const adopted=await marketplace.adoptCurriculumPack({data:{
      ...scope,packId:publisherPack.packId,versionId:publisherPack.versionId,
    }});
    expect(adopted.adopted).toBe(true);
    const orgSupplement=await marketplace.addMarketplaceSupplement({data:{
      ...scope,courseVersionId:foreignDraft.versionId,scope:"program",
      title:"School supplemental equation reference",kind:"link",
      url:"https://www.khanacademy.org/math/algebra",
      lessonId:"algebra1-equations",
    }});
    expect(orgSupplement.supplementId).toBeTruthy();
    const eligible=await listLaunchEligibleCourses(programIdentity,tx);
    expect(eligible.some(c=>c.versionId===foreignDraft.versionId)).toBe(true);
    expect(eligible.find(c=>c.versionId===foreignDraft.versionId)).toMatchObject({
      origin:"adopted",publisherName:"Independent Curriculum Publisher",
      packName:"Publisher Algebra I",
    });
    state.actor=staff; // Launch still requires the school's separate program-launch grant.
    const selected=await provisionLaunchSection({data:{
      ...provision,courseTemplateVersionId:foreignDraft.versionId,code:`EXT-${suffix}`,
      title:"Adopted Publisher Algebra I",
    }});
    expect(first(await tx.select().from(s.sections).where(eq(s.sections.id,selected.sectionId)))
      .courseTemplateVersionId).toBe(foreignDraft.versionId);
    await tx.insert(s.sectionTeachers).values({sectionId:selected.sectionId,personId:teacher.id});
    await tx.insert(s.enrollments).values({
      studentProfileId:student.id,kind:"section",status:"active",organizationId:org.id,
      programId:program.id,schoolYearId:time.schoolYear.id,sectionId:selected.sectionId,
    });

    act("teacher",teacher.id);
    const teacherWorkspace=await getClassWorkspace({data:{sectionId:selected.sectionId}});
    expect(teacherWorkspace.content).toEqual(thirdPartyContent);
    expect(teacherWorkspace.teacherGuides?.units[0]?.lessons[0]?.workedAnswers[0]?.answer)
      .toContain("x=5");
    const {addClassSupplement}=await import("@/modules/learning/class-supplements.functions");
    const supplement=await addClassSupplement({data:{
      sectionId:selected.sectionId,lessonId:"algebra1-equations",kind:"link",
      title:"Teacher practice extension",url:"https://www.khanacademy.org/math/algebra",
    }});
    expect(supplement.supplementId).toBeTruthy();
    const {createAssessment,gradeSubmission}=await import("@/modules/learning/gradebook.functions");
    const task=await createAssessment({data:{
      sectionId:selected.sectionId,title:"Publisher-aligned Algebra Practice",
      instructions:"Solve 3x + 5 = 20, show and check each step.",pointsPossible:10,
      assignmentKind:"homework",curriculumLessonId:"algebra1-equations",
      rubricCriteria:[{id:"equation",label:"Reasoning",maxPoints:10,
        description:"Equality-preserving steps and substitution"}],
      dueAt:new Date(Date.now()+7*86400000).toISOString(),
    }});
    const [assigned]=await tx.select().from(s.submissions)
      .where(eq(s.submissions.assessmentId,task.assessmentId)).limit(1);
    expect(assigned?.studentProfileId).toBe(student.id);

    act("student",learner.id);
    const studentWorkspace=await getClassWorkspace({data:{sectionId:selected.sectionId}});
    expect(studentWorkspace.content?.modules[0]?.lessons[0]?.id).toBe("algebra1-equations");
    expect(studentWorkspace.teacherGuides).toBeNull();
    expect(studentWorkspace.supplements.some(r=>r.title==="Teacher practice extension"&&
      r.source==="teacher")).toBe(true);
    expect(studentWorkspace.supplements.some(r=>r.title==="School supplemental equation reference"&&
      r.source==="organization")).toBe(true);
    const {getAssignments,saveAssignmentResponse}=await import("@/modules/student-experience/assignments.functions");
    const assignments=await getAssignments();
    expect(assignments.assignments.some(a=>a.assessmentId===task.assessmentId&&
      a.metadata.curriculumLessonId==="algebra1-equations")).toBe(true);
    await setLessonCompletion({data:{
      sectionId:selected.sectionId,versionId:foreignDraft.versionId,lessonId:"algebra1-equations",completed:true,
    }});
    const response=await saveAssignmentResponse({data:{
      assessmentId:task.assessmentId,text:"3x=15, x=5. Substituting 3(5)+5=20.",
    }});
    expect(response.submissionId).toBe(assigned.id);
    await expect(createAssessment({data:{
      sectionId:selected.sectionId,title:"Unauthorized",pointsPossible:10,
    }})).rejects.toThrow();

    act("teacher",teacher.id);
    await gradeSubmission({data:{
      submissionId:response.submissionId,
      rubricScores:[{id:"equation",points:10}],
      feedbackComment:"Correct inverse operations and substitution.",
    }});
    act("student",learner.id);
    const feedback=(await getAssignments()).assignments.find(a=>a.assessmentId===task.assessmentId);
    expect(feedback?.status).toBe("graded");
    expect(Number(feedback?.score)).toBe(10);
    expect(feedback?.feedbackText).toContain("Correct inverse operations");
    expect((await getClassWorkspace({data:{sectionId:selected.sectionId}})).progress)
      .toEqual([{lessonId:"algebra1-equations",completedAt:expect.any(String)}]);

    state.actor=staff;
    await tx.update(s.curriculumEntitlements).set({status:"revoked"})
      .where(eq(s.curriculumEntitlements.id,installed.entitlementId));
    await expect(provisionLaunchSection({data:{
      ...provision,courseTemplateVersionId:foreignDraft.versionId,
      code:`DENY-${suffix}`,title:"Revoked-license class",
    }})).rejects.toThrow("Choose a published course");
    // No already-running classroom version pointer was rewritten by revocation.
    expect(first(await tx.select().from(s.sections).where(eq(s.sections.id,selected.sectionId)))
      .courseTemplateVersionId).toBe(foreignDraft.versionId);
    // Verify that unauthorized school users cannot publish the external publisher course.
    await expect(flow.startCurriculumDraft({data:{
      ...request,courseId:foreignCourse.courseId,requestId:crypto.randomUUID(),
    }})).rejects.toThrow("owning organization");
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

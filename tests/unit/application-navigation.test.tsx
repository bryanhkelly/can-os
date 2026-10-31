import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Route as Courses } from "@/routes/student.courses";
import { Route as Notifications } from "@/routes/notifications";
import { Route as Operations } from "@/routes/operations.index";
import { Route as Site } from "@/routes/sites.$siteId.index";
import { Route as Admissions } from "@/routes/admissions.index";
import { Route as Intake } from "@/routes/admissions.intake";
import { Route as Families } from "@/routes/admissions.families";
import { Route as Support } from "@/routes/student.support";
import { Route as CourseRequests } from "@/routes/operations.course-requests";
import { Route as Offers } from "@/routes/guardian.admission-offers";
import { Route as Permissions } from "@/routes/guardian.group-permissions";
import { Route as StudentGroups } from "@/routes/student.study-groups";
import { Route as TeacherGroups } from "@/routes/teacher.study-groups";
import { readinessFromSnapshot } from "@/domain/program-readiness";

const state=vi.hoisted(()=>({search:{} as Record<string,unknown>,data:null as unknown}));
// Static presentation tests never open a database connection.
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/hooks/useWorkspaceMutation", () => ({ useWorkspaceMutation: () => ({ isSubmitting: false, submit: vi.fn() }) }));
vi.mock("@tanstack/react-router",()=>({
  createFileRoute:()=> (options:object)=>({
    options,useSearch:()=>state.search,useLoaderData:()=>state.data,
  }),
  Link:({to,search,params,children,...props}:{
    to:string;search?:Record<string,string|undefined>;params?:Record<string,string>;children:ReactNode;
  })=>{
    const path=to.replace(/\$([^/]+)/g,(_,key:string)=>params?.[key]??key);
    const query=new URLSearchParams(Object.entries(search??{}).filter((entry):entry is [string,string]=>entry[1]!==undefined)).toString();
    return <a href={path+(query?"?"+query:"")} {...props}>{children}</a>;
  },
  useRouter:()=>({invalidate:vi.fn()}),
}));
vi.mock("@/modules/learning/course-registration.functions",()=>({
  getCourseRegistration:vi.fn(),requestCourseChange:vi.fn(),decideCourseChange:vi.fn(),
}));
vi.mock("@/modules/student-experience/assignments.functions",()=>({getAssignments:vi.fn()}));
vi.mock("@/modules/communication/notification-center.functions",()=>({
  getNotifications:vi.fn(),readNotification:vi.fn(),readAllNotifications:vi.fn(),setNotificationStatus:vi.fn(),
}));
vi.mock("@/modules/communication/delivery-history.functions",()=>({getDeliveryHistory:vi.fn()}));
vi.mock("@/modules/operations/command-center.functions",()=>({getLiveOperationsCommandCenter:vi.fn()}));
vi.mock("@/modules/operations/release-health.functions",()=>({getReleaseHealth:vi.fn()}));
vi.mock("@/modules/operations/outbox-health.functions",()=>({getOutboxHealthSummary:vi.fn()}));
vi.mock("@/modules/operations/action-workspace.functions",()=>({
  getOperationsActions:vi.fn(),updateOperationsAction:vi.fn(),assignOperationsAction:vi.fn(),
}));
vi.mock("@/modules/operations/site-today.functions",()=>({getSiteToday:vi.fn()}));
vi.mock("@/modules/programs/opening-handoff.functions",()=>({acknowledgeLaunchHandoff:vi.fn(),transferLaunchHandoff:vi.fn()}));
vi.mock("@/modules/enrollment/course-placement.functions",()=>({listEnrollmentPlacements:vi.fn(),placeEnrolledStudent:vi.fn()}));
vi.mock("@/modules/enrollment/admissions-dashboard.functions",()=>({getAdmissionsDashboard:vi.fn()}));
vi.mock("@/modules/enrollment/admissions-intake.functions",()=>({
 listAdmissionsIntake:vi.fn(),listAdmissionsIntakePrograms:vi.fn(),listAdmissionsExistingStudents:vi.fn(),createAdmissionsInquiry:vi.fn(),
 provisionInquiryGuardianAccount:vi.fn(),sendAdmissionsGuardianInvitation:vi.fn(),
 verifyAdmissionsGuardianRelationship:vi.fn(),transitionAdmissionsStage:vi.fn(),
}));
vi.mock("@/modules/operations/site-directory.functions",()=>({listMySites:vi.fn()}));
vi.mock("@/modules/enrollment/admissions-program-directory.functions",()=>({listAdmissionsPrograms:vi.fn()}));
vi.mock("@/modules/enrollment/admissions-offer.functions",()=>({
  getAdmissionOfferOptions:vi.fn(),issueAdmissionOffer:vi.fn(),activateOfferedEnrollment:vi.fn(),withdrawIssuedAdmissionOffer:vi.fn(),
}));
vi.mock("@/modules/enrollment/student-access-handoff.functions",()=>({
  consentToStudentLearningAccount:vi.fn(),getStudentLearningHandoff:vi.fn(),provisionStudentLearningAccess:vi.fn(),
}));
vi.mock("@/modules/enrollment/public-admissions-interest.functions",()=>({
  listPublicAdmissionsInterests:vi.fn(),setPublicAdmissionsInterestStatus:vi.fn(),
}));
vi.mock("@/modules/enrollment/r2-document-upload.functions",()=>({
  beginEnrollmentDocumentUpload:vi.fn(),finishEnrollmentDocumentUpload:vi.fn(),
  getEnrollmentDocumentDownload:vi.fn(),getEnrollmentDocumentUploadAvailability:vi.fn(),
}));
vi.mock("@/modules/enrollment/family-readiness.functions",()=>({
  getFamilyReadiness:vi.fn(),setFamilyRequirement:vi.fn(),addRequirementReviewNote:vi.fn(),reviewRequirementDocument:vi.fn(),
}));
vi.mock("@/modules/support/support-referrals.functions",()=>({
  advanceSupportReferral:vi.fn(),createSupportReferral:vi.fn(),getSupportReferrals:vi.fn(),
  getSupportViewerRole:vi.fn(),listTeacherReferralStudents:vi.fn(),saveSupportPlan:vi.fn(),
  scheduleSupportService:vi.fn(),completeSupportService:vi.fn(),
}));
vi.mock("@/modules/actions/student-actions.functions",()=>({getQuickWinActions:vi.fn(),requestQuickWinHelp:vi.fn()}));
vi.mock("@/modules/learning/registrar-course-requests.functions",()=>({listRegistrarCourseRequests:vi.fn()}));
vi.mock("@/modules/enrollment/guardian-admission-offers.functions",()=>({getGuardianAdmissionOffers:vi.fn()}));
vi.mock("@/modules/enrollment/guardian-enrollment-checklist.functions",()=>({getGuardianEnrollmentChecklist:vi.fn()}));
vi.mock("@/modules/enrollment/enrollment-form.functions",()=>({submitGuardianEnrollmentForm:vi.fn(),decideEnrollmentForm:vi.fn()}));
vi.mock("@/modules/study-groups/canonical-workspace.functions",()=>({
  listCanonicalGuardianGroupConsents:vi.fn(),getStudyGroupAvailability:vi.fn(),
}));
vi.mock("@/modules/study-groups/canonical-membership.functions",()=>({
  decideCanonicalGroupConsent:vi.fn(),requestCanonicalGroupMembership:vi.fn(),leaveCanonicalGroup:vi.fn(),
  createFacilitatedGroup:vi.fn(),decideCanonicalGroupMembership:vi.fn(),createStudentStudyGroup:vi.fn(),
}));
vi.mock("@/modules/study-groups/study-group-queries.functions",()=>({
  listStudyGroups:vi.fn(),getStudyGroupDetail:vi.fn(),listFacilitatorGroupScopes:vi.fn(),
  listStudyGroupReviewQueue:vi.fn(),listStudyGroupReports:vi.fn(),listStudentStudyGroupSections:vi.fn(),
  listStudentStudyGroupClassmates:vi.fn(),
}));
vi.mock("@/modules/study-groups/facilitator-query.functions",()=>({getFacilitatorStudyGroups:vi.fn()}));
vi.mock("@/modules/study-groups/canonical-moderation.functions",()=>({
  createCanonicalGroupPost:vi.fn(),reportCanonicalGroupPost:vi.fn(),resolveCanonicalGroupReport:vi.fn(),
}));
vi.mock("@/modules/study-groups/canonical-sessions.functions",()=>({
  rsvpCanonicalGroupSession:vi.fn(),createCanonicalGroupSession:vi.fn(),reviseCanonicalGroupSession:vi.fn(),
  listCanonicalGroupAttendance:vi.fn(),recordCanonicalGroupAttendance:vi.fn(),
}));

function render(route:{options:{component?:unknown}}){
  const outcome=state.data as {ok?:boolean;data?:any}|null;
  if (outcome && route===Operations && outcome.ok===undefined) successful(outcome);
  if (outcome?.ok && route===Families && Array.isArray(outcome.data)) {
    successful({items:outcome.data,nextPage:null});
  }
  if (outcome?.ok && route===Intake && Array.isArray(outcome.data?.records)) {
    successful({...outcome.data,records:{items:outcome.data.records,hasMore:false,nextPage:null},
      stageCounts:[],existingStudentHasMore:false});
  }
  const Page=route.options.component;
  if(typeof Page!=="function")throw new Error("Missing page component");
  return renderToStaticMarkup(<Page/>);
}
function successful(data:unknown){state.data={ok:true,data};}

describe("application contextual navigation",()=>{
  beforeEach(()=>{state.search={};state.data=null;});

  it("opens the requested course and links to only that class's assignments",()=>{
    state.search={section:"english"};
    const policy={addDropEndsOn:"2030-01-01",withdrawalEndsOn:"2030-02-01",prerequisites:[],guardianApprovalRequired:false};
    successful({connected:true,viewerRole:"student",requests:[],sections:[
      {id:"math",title:"Mathematics",credits:1,enrollmentStatus:"active",policy},
      {id:"english",title:"English Literature",credits:1,enrollmentStatus:"active",policy},
    ]});
    const html=render(Courses);
    expect(html).toContain("English Literature");
    expect(html).not.toContain("Mathematics");
    expect(html).toContain('href="/student/assignments?section=english"');
    expect(html).toContain('href="/student/study-groups"');
  });

  it("reports an unavailable course without opening another course",()=>{
    state.search={section:"unavailable"};
    successful({connected:true,viewerRole:"student",requests:[],sections:[]});
    expect(render(Courses)).toContain("This course is unavailable in your current workspace.");
  });

  it("opens the selected notification and preserves its full related-record URL",()=>{
    state.search={notification:"selected"};
    successful({notices:[
      {id:"selected",title:"English feedback",status:"unread",date:"2030-01-01",body:"Read your feedback",href:"/student/assignments?assessment=essay"},
      {id:"other",title:"Unrelated update",status:"read",date:"2030-01-01",body:"Other",href:null},
    ],history:{ok:true,data:{items:[],nextCursor:null}}});
    const html=render(Notifications);
    expect(html).toContain('href="/student/assignments?assessment=essay"');
    expect(html).not.toContain("Unrelated update");
    expect(html).toContain("View all notifications");
  });

  it("opens only the selected operations action without exposing a forbidden referral workflow",()=>{
    state.search={action:"referral",siteId:"school",programId:"program"};
    state.data={
      operations:{items:[
        {id:"referral",kind:"action",title:"Academic referral",detail:"Support team follow-up",priority:"normal",managedBySupport:true,href:"/operations"},
        {id:"other",kind:"action",title:"Unrelated action",detail:"Other",priority:"normal",managedBySupport:false,href:"/operations"},
      ],sites:[],programs:[],assignees:[],summary:{total:2,urgent:0,needsResponse:2}},
      health:{buildId:"test",schemaStatus:"compatible",details:"Ready"},commandCenter:null,authError:"",
    };
    const html=render(Operations);
    expect(html).toContain("Academic referral");
    expect(html).not.toContain("Unrelated action");
    expect(html).toContain("Managed by the support team");
    expect(html).not.toContain('href="/student/support');
    expect(html).not.toContain(">Resolve</button>");
    expect(html).toContain('href="/operations?siteId=school&amp;programId=program&amp;action=referral"');
  });

  it("preserves the site, program, action and event in Site Today links",()=>{
    successful({
      site:{id:"school",name:"Test school",organizationName:"Test organization",timezone:"America/Los_Angeles"},
      localDate:"2030-01-01",asOf:"2030-01-01T12:00:00Z",
      enrollment:{count:1,note:"Active"},attendance:{count:1,present:1,absent:0,tardy:0,note:"Recorded"},
      actions:[{id:"task",title:"Review staffing",status:"open",priority:"normal",description:null,dueAt:null}],
      attentionItems:[{id:"action:task",category:"staffing",title:"Review staffing",detail:"Review the staffing follow-up.",
        href:"/operations?siteId=school&action=task",nextStep:"Review action",ownerName:null,dueAt:null,priority:"normal"}],
      events:[{id:"event",title:"Evening assembly",startsAt:"2030-01-02T01:00:00Z",type:"assembly"}],
      programs:[{id:"program",name:"Test program",status:"active",type:"full_school",gradeRange:{min:"9",max:"12"}}],
      openingHandoffs:[],schoolOpenings:[],viewerPersonId:"operator",canOpenOnsiteDay:false,
      schoolDay:{
        staffing:{blocks:[],unassignedOrConflicting:0,missingAdultReports:0,substitutions:0,
          unacknowledged:0,coverageExceptions:0,witnessedBlocks:0},
        students:[],projectionTruncated:false,note:"Source-derived school-day projection",
        exceptions:{pendingGuardianExplanations:0,healthVisits:0,sentHome:0,incidents:0,
          emergencyHolds:0,openIncidents:0,uncollectedFollowUps:0},
      },
    });
    const html=render(Site);
    expect(html).toContain('href="/operations?siteId=school&amp;action=task"');
    expect(html).toContain('href="/operations/launch?siteId=school"');
    expect(html).toContain('href="/admissions?siteId=school"');
    expect(html).toContain('href="/operations/launch/program?siteId=school"');
    expect(html).toContain('href="/calendar?date=2030-01-01&amp;event=event"');
  });

  it("routes a handoff to its owning workspace without generic resolve or reassignment controls",()=>{
    state.data={
      operations:{items:[{id:"handoff",kind:"action",title:"Opening handoff",detail:"Named recipient receipt",
        priority:"high",openingHandoff:true,siteId:"school",ownerPersonId:"receiver"}],
        sites:[],programs:[],assignees:[],summary:{total:1,urgent:0,needsResponse:1}},
      health:{buildId:"test",schemaStatus:"compatible",details:"Ready"},commandCenter:null,authError:"",
    };
    const html=render(Operations);
    expect(html).toContain('href="/sites/school"');
    expect(html).toContain("Named-recipient acknowledgment");
    expect(html).not.toContain("Resolve</button>");
    expect(html).not.toContain("Assign Opening handoff");
  });

  it("keeps the selected application when opening household readiness",()=>{
    state.search={siteId:"school",application:"application"};
    successful({
      sites:[],programs:[],options:[],
      rows:[{id:"application",programId:"program",program:"Test program",stage:"inquiry",submittedAt:null,outstandingRequirements:0,offers:[],enrollments:[]},
        {id:"other",programId:"other-program",program:"Unrelated application",stage:"inquiry",submittedAt:null,outstandingRequirements:0,offers:[],enrollments:[]}],
    });
    const html=render(Admissions);
    expect(html).toContain('href="/admissions/families?siteId=school&amp;programId=program&amp;application=application"');
    expect(html).not.toContain("Unrelated application");
  });

  it("returns from household readiness to the same admissions application",()=>{
    state.search={siteId:"school",programId:"program",application:"application"};
    successful([{id:"application",householdId:"household",program:"Test program",stage:"inquiry",isFixture:false,
      offers:[],activeSchoolYears:[],requirements:[],readiness:{completed:0,total:0,blockers:0},journeyStatus:null}]);
    expect(render(Families)).toContain('href="/admissions?siteId=school&amp;programId=program&amp;application=application"');
  });

  it("shows the Admissions waitlist and does not offer a seat until restored",()=>{
    state.search={application:"application"};
    successful({sites:[],programs:[],options:[{applicationId:"application",years:[{id:"year",name:"School year"}]}],
      rows:[{id:"application",studentName:"Waitlisted Student",programId:"program",program:"Academy",stage:"eligibility",
        disposition:"waitlisted",outstandingRequirements:0,offers:[],enrollments:[]}]});
    const html=render(Admissions);
    expect(html).toContain("restore this application to review");
    expect(html).not.toContain("Registrar: Issue offer");
    expect(html).toContain('href="/admissions/intake?programId=program&amp;application=application"');
    state.search={};
    expect(render(Admissions)).toContain("Restore waitlisted application to review");
  });

  it("keeps the selected Admissions intake application when resolving an offer exception",()=>{
    state.search={application:"application"};
    successful({programs:[],existingStudents:[],publicInterests:{items:[],nextCursor:null},linkedInterest:null,records:[
      {id:"application",studentFirst:"Selected",studentLast:"Applicant",programId:"program",siteId:"school",
        programName:"Academy",stage:"eligibility",disposition:"waitlisted",updatedAt:"2030-01-01"},
      {id:"other",studentFirst:"Unrelated",studentLast:"Applicant",programId:"program",
        programName:"Academy",stage:"inquiry",updatedAt:"2030-01-01"},
    ]});
    const html=render(Intake);
    expect(html).toContain("Selected Applicant");
    expect(html).not.toContain('>Unrelated Applicant</h3>');
    expect(html).toContain("Restore to review");
    expect(html).toContain('href="/admissions?siteId=school&amp;programId=program&amp;application=application"');
  });

  it("offers existing students only from the selected intake program without replacing new-student intake",()=>{
    state.search={programId:"program"};
    successful({programs:[{id:"program",name:"Academy",siteId:"school"}],records:[],publicInterests:{items:[],nextCursor:null},linkedInterest:null,existingStudents:[
      {programId:"program",studentProfileId:"existing",guardianPersonId:"guardian",householdId:"household",
        studentFirstName:"Existing",studentLastName:"Learner",guardianFirstName:"Managing",guardianLastName:"Guardian"},
      {programId:"program",studentProfileId:"unlinked",guardianPersonId:"unlinked-guardian",householdId:null,
        studentFirstName:"Unlinked",studentLastName:"Learner",guardianFirstName:"Unlinked",guardianLastName:"Guardian"},
      {programId:"other",studentProfileId:"outside",guardianPersonId:"other-guardian",householdId:"other-household",
        studentFirstName:"Outside",studentLastName:"Learner",guardianFirstName:"Other",guardianLastName:"Guardian"},
    ]});
    const html=render(Intake);
    expect(html).toContain("Existing Learner");
    expect(html).toContain("Managing Guardian");
    expect(html).toContain("new household required");
    expect(html).not.toContain("Outside Learner");
    expect(html).toContain("Create a new student");
    expect(html).toContain("Student first name");
    expect(html).toContain("Creating an inquiry does not activate enrollment.");
  });

  it("filters the admissions pipeline by stage without dropping scope from applicant links",()=>{
    state.search={siteId:"school",programId:"program",stage:"inquiry"};
    successful({
      sites:[],programs:[],options:[],
      rows:[
        {id:"jordan",studentName:"Jordan Sample",programId:"program",program:"Academy",stage:"inquiry",submittedAt:null,outstandingRequirements:2,offers:[],enrollments:[]},
        {id:"casey",studentName:"Casey Sample",programId:"program",program:"Academy",stage:"accepted",submittedAt:null,outstandingRequirements:0,offers:[],enrollments:[]},
      ],
    });
    const html=render(Admissions);
    expect(html).toContain("Jordan Sample");
    expect(html).not.toContain("Casey Sample");
    expect(html).toContain("Review 2 blocking requirement(s)");
    expect(html).toContain('href="/admissions?siteId=school&amp;programId=program&amp;application=jordan"');
    expect(html).toContain('href="/admissions?siteId=school&amp;programId=program&amp;stage=inquiry" aria-current="page"');
  });

  it("opens a staff referral without relying on a second client-side role lookup",()=>{
    state.search={referral:"referral"};
    successful({viewerRole:"specialist",referrals:[
      {id:"referral",title:"Academic coaching",category:"academic",stage:"submitted",priority:"normal",description:"Read evidence",assignedTo:"Coach",plan:null,services:[]},
      {id:"other",title:"Unrelated referral",category:"academic",stage:"submitted",priority:"normal",description:"Other",assignedTo:"Coach",plan:null,services:[]},
    ]});
    const html=render(Support);
    expect(html).toContain("Academic coaching");
    expect(html).toContain("Read evidence");
    expect(html).not.toContain("Unrelated referral");
    expect(html).not.toContain("Loading authorized support workspace");
  });

  it("sends readiness shortcuts to operational owners, not student pages",()=>{
    const links=Object.fromEntries(readinessFromSnapshot({}).map(item=>[item.key,item.href]));
    expect(links).toMatchObject({
      academics:"/operations/launch",staffing:"/staff/teachers",
      calendar:"/operations/school-years",enrollment:"/admissions/capacity",
    });
    expect(Object.values(links).some(href=>href.startsWith("/student"))).toBe(false);
  });

  it("retains delivery scope in course request queues and return links",()=>{
    state.search={siteId:"school",programId:"program"};
    successful([
      {id:"request",siteId:"school",programId:"program",studentName:"Jordan",sectionTitle:"English Literature",operation:"add",createdAt:"2030-01-01",deadline:"2030-02-01",programActive:true,canApprove:true},
      {id:"other",siteId:"other-school",programId:"other-program",sectionTitle:"Unrelated course"},
    ]);
    const html=render(CourseRequests);
    expect(html).toContain("English Literature");
    expect(html).not.toContain("Unrelated course");
    expect(html).toContain('href="/operations/course-policies?siteId=school&amp;programId=program"');
    expect(html).toContain('href="/operations?siteId=school&amp;programId=program"');
  });

  it("opens only the requested offer for the selected child",()=>{
    state.search={student:"child",offer:"selected"};
    successful([{applicationId:"application",studentName:"Jordan",program:"English program",blockers:[],offers:[
      {id:"selected",status:"accepted",progress:{message:"Admissions must activate enrollment.",canAccept:false}},
      {id:"other",status:"declined",progress:{message:"Offer declined.",canAccept:false}},
    ]}]);
    const html=render(Offers);
    expect(html).toContain("Offer status: accepted");
    expect(html).not.toContain("Offer status: declined");
    expect(html).toContain('href="/guardian/admission-offers?student=child"');
  });

  it("shows family-facing readiness blockers without offering premature acceptance",()=>{
    successful([{applicationId:"application",studentName:"Jordan",program:"Academy",
      blockers:[{id:"review",title:"Enrollment review",status:"needs_you"}],offers:[
        {id:"offer",status:"issued",schoolYearName:"2030-2031",expiresAt:null,enrollmentActive:false,
          progress:{message:"Enrollment requirements need review.",canAccept:false}},
      ]}]);
    const html=render(Offers);
    expect(html).toContain("Enrollment review");
    expect(html).toContain("needs you");
    expect(html).toContain("School year: 2030-2031");
    expect(html).toMatch(/<button disabled=""[^>]*>Accept<\/button>/);
    expect(html).toMatch(/<button disabled=""[^>]*>Decline<\/button>/);
  });

  it("opens only the enrollment application linked from a document review notice",()=>{
    state.search={student:"child",application:"selected"};
    successful([
      {applicationId:"selected",studentName:"Jordan",program:"Selected enrollment",applicationStage:"application",blockers:[],offers:[]},
      {applicationId:"other",studentName:"Casey",program:"Unrelated enrollment",applicationStage:"application",blockers:[],offers:[]},
    ]);
    const html=render(Offers);
    expect(html).toContain("Selected enrollment");
    expect(html).not.toContain("Unrelated enrollment");
    expect(html).toContain("Enrollment checklist");
    expect(html).toContain("Loading enrollment checklist");
    expect(html).toContain('href="/guardian/admission-offers?student=child"');
  });

  it("does not let the registrar enrollment checklist bypass pending document review",()=>{
    successful([{id:"application",householdId:"household",program:"Academy",stage:"application",isFixture:false,
      offers:[],activeSchoolYears:[],journeyStatus:"in_progress",readiness:{completed:0,total:1,blockers:1},
      requirements:[{id:"document",title:"Enrollment evidence",status:"needs_you",blocking:true,documents:[],
        evidence:[{kind:"document_review",status:"received",text:"Awaiting review"}]}]}]);
    const html=render(Families);
    expect(html).toMatch(/<input type="checkbox" disabled=""/);
    expect(html).toContain("the checklist cannot bypass review");
    expect(html).toContain("Document request and rejection reasons are visible to the family");
  });

  it("does not open another enrollment application when a checklist link is unavailable",()=>{
    state.search={application:"missing"};
    successful([{applicationId:"other",studentName:"Casey",program:"Unrelated enrollment",blockers:[],offers:[]}]);
    const html=render(Offers);
    expect(html).toContain("This enrollment application is unavailable");
    expect(html).not.toContain("Unrelated enrollment");
  });

  it("links active enrollment with assigned classes to the family workspace",()=>{
    successful([{applicationId:"application",studentName:"Jordan",program:"Academy",blockers:[],offers:[
      {id:"offer",status:"accepted",schoolYearName:"2030-2031",enrollmentActive:true,sectionCount:2,
        progress:{message:"Enrollment is active and classes are assigned.",canAccept:false}},
    ]}]);
    const html=render(Offers);
    expect(html).toContain("2 assigned classes");
    expect(html).toContain('href="/guardian"');
    expect(html).not.toContain(">Accept</button>");
  });

  it("requires reason and confirmation for issued-offer withdrawal, never accepted offers",()=>{
    state.search={application:"application"};
    const row={id:"application",programId:"program",program:"Academy",stage:"application",
      submittedAt:null,outstandingRequirements:0,enrollments:[],
      offers:[{id:"offer",schoolYearId:"year",status:"issued",expiresAt:null}]};
    successful({sites:[],programs:[],options:[],rows:[row]});
    const html=render(Admissions);
    expect(html).toContain("Reason for withdrawal (internal)");
    expect(html).toMatch(/<textarea required="" minLength="10" maxLength="2000"/);
    expect(html).toContain('type="checkbox" required=""');
    expect(html).toMatch(/<button type="submit" disabled=""[^>]*>Withdraw offer<\/button>/);
    successful({sites:[],programs:[],options:[],rows:[{...row,stage:"accepted",outstandingRequirements:1,
      offers:[{...row.offers[0],status:"accepted"}]}]});
    const accepted=render(Admissions);
    expect(accepted).not.toContain("Withdraw offer");
    expect(accepted).toContain("Accepted offer ready. Select a staffed class below to activate enrollment and placement together.");
  });

  it("does not replace an unavailable group permission request with another",()=>{
    state.search={action:"unavailable"};
    successful([{id:"other",groupTitle:"Unrelated group",status:"open"}]);
    const html=render(Permissions);
    expect(html).toContain("This permission request is unavailable");
    expect(html).not.toContain("Unrelated group");
  });

  it("uses the same URL for student group titles and Open controls",()=>{
    successful({enabled:true,writesEnabled:false,membershipEnabled:false,contentEnabled:false,creationEnabled:false,sections:[],
      groups:[{id:"group",title:"English study group",kind:"course",capacity:20,membership:null}]});
    const html=render(StudentGroups);
    expect(html.match(/href="\/student\/study-groups\?group=group"/g)).toHaveLength(2);
  });
});

describe("major-role shared shell adoption",()=>{
  beforeEach(()=>{state.search={};state.data=null;});

  it.each([
    ["guardian enrollment",Offers,[],"CAN OS · Family","Family home"],
    ["student support",Support,{viewerRole:"student",actions:[]},"CAN OS · Student support","Student Today"],
    ["student groups",StudentGroups,{enabled:true,writesEnabled:false,membershipEnabled:false,contentEnabled:false,creationEnabled:false,sections:[],groups:[]},"CAN OS · Student","Student Today"],
    ["teacher groups",TeacherGroups,{enabled:false,writesEnabled:false,membershipEnabled:false,creationEnabled:false,moderationEnabled:false,queue:[],reports:[],groups:[],scopes:[]},"CAN OS · Teacher","Teacher Today"],
  ] as const)("uses one standard shell and header for %s",(_name,route,data,eyebrow,breadcrumb)=>{
    successful(data);
    const html=render(route);
    expect(html.match(/<main/g)).toHaveLength(1);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain(eyebrow);
    expect(html).toContain(breadcrumb);
    expect(html).toContain("min-h-screen bg-background");
  });

  it("keeps operator scope filters inside the standard shell with shared metrics",()=>{
    state.data={
      operations:{items:[],sites:[],programs:[],assignees:[],summary:{total:0,urgent:0,overdue:0,unassigned:0,waiting:0,needsResponse:0}},
      health:{buildId:"test",schemaStatus:"compatible",details:"Ready"},commandCenter:null,authError:"",
    };
    const html=render(Operations);
    expect(html.match(/<main/g)).toHaveLength(1);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Operations filters"');
    expect(html).toContain('aria-label="Filter operations by school"');
    expect(html).toContain('aria-label="Filter operations by program"');
    expect(html).toContain("No actions currently require attention.");
    expect(html).toContain("School launches");
    expect(html).toContain("Workflows");
  });
});

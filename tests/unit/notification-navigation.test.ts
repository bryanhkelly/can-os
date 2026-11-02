import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type Table } from "drizzle-orm";
import { getNotifications } from "@/modules/communication/notification-center.functions";

const state=vi.hoisted(()=>({
  role:"guardian",rows:{} as Record<string,unknown[]>,select:vi.fn(),
}));
vi.mock("@tanstack/react-start",()=>({
  createServerFn:()=>({validator(){return this;},handler(callback:unknown){return callback;}}),
}));
vi.mock("@tanstack/react-start/server",()=>({getRequest:vi.fn(),setResponseHeader:vi.fn()}));
vi.mock("@/modules/identity/command-context.server",()=>({
  getCommandContext:async()=>({role:state.role,actorPersonId:"actor",
    scope:{organizationIds:["organization"],siteIds:["school"],programIds:["program"]}}),
}));
vi.mock("@/db/client",()=>({db:{select:state.select,selectDistinct:state.select}}));
vi.mock("@neondatabase/serverless",()=>({Pool:class {}}));
vi.mock("drizzle-orm/neon-serverless",()=>({drizzle:()=>({select:state.select})}));

beforeEach(()=>{
  state.role="guardian";
  state.rows={};
  state.select.mockImplementation(()=>{
    let tableName="";
    return {
      from(table:Table){tableName=getTableName(table);return this;},
      innerJoin(){return this;},where(){return this;},orderBy(){return this;},
      limit:async()=>state.rows[tableName]??[],
      then(resolve:(rows:unknown[])=>unknown,reject:(reason:unknown)=>unknown){
        return Promise.resolve(state.rows[tableName]??[]).then(resolve,reject);
      },
    };
  });
});

function notification(resourceType:string,resourceId:string,type="update"){
  state.rows.notifications=[{id:"notice",title:"Review update",body:null,status:"unread",
    resourceType,resourceId,type,createdAt:new Date("2030-01-01")}];
}
function offer(){
  notification("admission_offer","offer");
  state.rows.admission_offers=[{id:"offer",applicationId:"application",
    issuedByPersonId:"actor",programId:"program",studentProfileId:"profile"}];
  state.rows.student_profiles=[{id:"profile",personId:"child"}];
  state.rows.guardian_relationships=[{studentPersonId:"child"}];
}

describe("authorized notification destinations",()=>{
  it("shows a restricted handoff only with current named case access",async()=>{
    state.role="safeguarding_responder";
    notification("safeguarding_concern","case","safeguarding_response_required");
    state.rows.safeguarding_case_assignments=[{incidentId:"case"}];
    expect((await getNotifications())[0]?.href).toBe("/safeguarding?case=case");
  });
  it("removes the whole restricted handoff when case access is lost",async()=>{
    state.role="safeguarding_responder";
    notification("safeguarding_concern","case","safeguarding_response_required");
    expect(await getNotifications()).toEqual([]);
  });
  it.each(["registrar","site_leader","guardian"])("hides restricted handoffs in the %s role",async role=>{
    state.role=role;
    notification("safeguarding_concern","case","safeguarding_response_required");
    state.rows.safeguarding_case_assignments=[{incidentId:"case"}];
    expect(await getNotifications()).toEqual([]);
  });

  it("preserves both the child and offer for a guardian",async()=>{
    offer();
    expect((await getNotifications())[0]?.href).toBe("/guardian/admission-offers?student=child&offer=offer");
  });
  it("opens the offer's application for its authorized registrar",async()=>{
    state.role="registrar";
    offer();
    expect((await getNotifications())[0]?.href).toBe("/admissions?application=application");
  });
  it("does not surface the offer notification at all without the guardian relationship",async()=>{
    offer();
    state.rows.guardian_relationships=[];
    expect(await getNotifications()).toHaveLength(0);
  });
  it("opens the exact child and application for a scoped document correction",async()=>{
    notification("application","application","enrollment_document_rejected");
    state.rows.applications=[{id:"application",studentPersonId:"child"}];
    expect((await getNotifications())[0]?.href)
      .toBe("/guardian/admission-offers?student=child&application=application");
  });
  it("does not surface the document correction notification after application access is lost",async()=>{
    notification("application","application","enrollment_document_rejected");
    expect(await getNotifications()).toHaveLength(0);
  });
  it("preserves the assigned operations action",async()=>{
    state.role="registrar";
    notification("action","assigned","operations_action_assigned");
    state.rows.actions=[{id:"assigned",siteId:"school",programId:"program"}];
    expect((await getNotifications())[0]?.href).toBe("/operations?action=assigned");
  });
  it("opens the exact permission action",async()=>{
    notification("action","consent","study_group_consent_requested");
    state.rows.actions=[{id:"consent",programId:"program"}];
    expect((await getNotifications())[0]?.href).toBe("/guardian/group-permissions?action=consent");
  });
  it("opens the facilitator's specific group",async()=>{
    state.role="teacher";
    notification("study_group","group");
    state.rows.study_groups=[{id:"group",facilitator:"actor"}];
    expect((await getNotifications())[0]?.href).toBe("/groups?group=group");
  });
  it("deep-links a guardian course approval review to its workspace",async()=>{
    notification("action","request","course_registration_guardian_review");
    expect((await getNotifications())[0]?.href).toBe("/guardian/course-approvals");
  });
  it("deep-links a field trip permission request to its workspace",async()=>{
    notification("field_trip","trip","field_trip_permission_requested");
    state.rows.field_trips=[{id:"trip"}];
    expect((await getNotifications())[0]?.href).toBe("/guardian/field-trips");
  });
  it("withholds guardian approval destinations from other roles",async()=>{
    state.role="teacher";
    notification("action","request","course_registration_guardian_review");
    expect((await getNotifications())[0]?.href).toBeNull();
    state.role="student";
    notification("field_trip","trip","field_trip_permission_requested");
    expect((await getNotifications())[0]?.href).toBeNull();
  });
  it("opens a group for a currently enrolled invited classmate",async()=>{
    state.role="student";
    notification("study_group","group","study_group_invitation");
    state.rows.study_groups=[{id:"group",facilitator:"teacher",siteId:"school",
      programId:"program",sectionId:"section"}];
    expect((await getNotifications())[0]?.href)
      .toBe("/student/study-groups?group=group");
  });
});

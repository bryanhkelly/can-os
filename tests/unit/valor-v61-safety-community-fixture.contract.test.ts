import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source=(name:string)=>readFileSync(name,"utf8");
const recovery=(file:string)=>source(`scripts/recovery/${file}`);
const groups=source("src/modules/study-groups/canonical-membership.server.ts");
const workspace=source("src/modules/study-groups/canonical-workspace.functions.ts");
const discussion=source("src/modules/classes/native-class-discussions.functions.ts");
const generic=source("src/modules/communication/messages.functions.ts");
const current=source("src/modules/communication/current-canonical-class-thread.server.ts");
const classViews=source("src/domain/class-views.ts");
const classRoute=source("src/routes/class_.$classId.tsx");

describe("Valor canonical, private synthetic community fixtures",()=>{
  it("binds new study groups to the real native Class model without recreating Sections",()=>{
    const fixture=recovery("valor-v61-full-demo-phase8-groups-20261120.sql");
    expect(fixture).toContain("'canonicalClassId'");
    expect(fixture).toContain("section_id=NULL");
    expect(fixture).toContain("requires_approval");
    expect(fixture).toContain("ON CONFLICT(group_id,person_id) DO NOTHING");
    expect(fixture).not.toMatch(/INSERT\s+INTO\s+public\.(sections|cohorts)\b/i);
    expect(groups).toContain("canonicalGroupClassId");
    expect(groups).toContain('eq(canonicalClassEnrollments.status,"active")');
    expect(groups).toContain('eq(canonicalClassStaffAssignments.state,"approved")');
    expect(workspace).toContain("permittedNativeClasses");
    expect(workspace).toContain("inArray(s.studyGroups.siteId, sites)");
    expect(workspace).toContain("permittedNativeClasses.has");
    expect(groups).toContain("!isCanonicalClassGroup && group.programId");
    expect(workspace).toContain('eq(canonicalClassEnrollments.status,"active")');
  });

  it("requires explicit Class ownership on every student or teacher conversation",()=>{
    const fixture=recovery("valor-v61-full-demo-phase11-class-discussions-20261120.sql");
    expect(fixture).toContain("'class',v_class_id");
    expect(fixture).toContain("'notPublic',true");
    expect(fixture).toContain('"notActuallySent":true');
    expect(discussion).toContain("authorizeCanonicalCourseAttempt");
    expect(discussion).toContain("communicationParticipants.participantId");
    expect(discussion).toContain("assertCurrentCanonicalClassThread(actor,thread)");
    expect(current).toContain('eq(canonicalClassEnrollments.status,"active")');
    expect(current).toContain('eq(canonicalClassStaffAssignments.state,"approved")');
    expect(generic).toContain("assertCurrentCanonicalClassThread(context,thread)");
    expect(classViews).toContain('"discussions"');
    expect(classRoute).toContain("<NativeClassDiscussionPanel");
  });

  it("does not invent guardian permission, medical actions, or real emergencies",()=>{
    const trips=recovery("valor-v61-full-demo-phase9-trips-20261120.sql");
    const safety=recovery("valor-v61-full-demo-phase10-health-safety-20261120.sql");
    expect(trips).toContain("'proposed'");
    expect(trips).toContain("'invited',NULL");
    expect(trips).not.toMatch(/INSERT\s+INTO\s+public\.(consent_records|field_trip_attendance|field_trip_chaperones)/i);
    expect(safety).toContain('"noRealIncident":true');
    expect(safety).toContain("'closed'");
    expect(safety).not.toMatch(/INSERT\s+INTO\s+public\.(safeguarding_concerns|safeguarding_external_reports|medication_administrations|medication_authorizations|incident_notifications)/i);
  });

  it("retains first-class calendar projections and database acceptance gates",()=>{
    const calendar=recovery("valor-v61-full-demo-phase12-group-calendar-20261120.sql");
    const check=source("scripts/acceptance/check-valor-v61-safety-community-20261120.sql");
    expect(calendar).toContain("public.scheduled_occurrences");
    expect(calendar).toContain("public.calendar_events");
    expect(calendar).toContain("source_type='study_group_session'");
    expect(check).toContain("33 existing published lesson collection intact");
    expect(check).toContain("32 other Person participants in private Class threads");
    expect(check).toContain("15 fabricated guardian trip permission references");
  });
});

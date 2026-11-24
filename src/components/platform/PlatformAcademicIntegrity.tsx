import { DirectoryTable, StatusBadge, WorkspaceNotice, WorkspacePanel } from "@/components/workspace";
import type { readPlatformAdminOverview } from "@/modules/identity/platform-admin.functions";

type Integrity = Awaited<ReturnType<typeof readPlatformAdminOverview>>["academicIntegrity"];
const remediation: Record<string, {label:string; owner:string}> = {
  legacy_active_without_recovered_class: {label:"Legacy placement without verified recovery",owner:"Registrar / data migration"},
  legacy_active_native_not_active: {label:"Recovered placement is not active",owner:"Registrar"},
  native_active_attempt_mismatch: {label:"Active Class attempt mismatch",owner:"Learning engineering"},
  native_active_unpublished_course: {label:"Active enrollment in unpublished Course",owner:"Publisher / registrar"},
  pending_without_verified_student_grant: {label:"Pending placement lacks verified student grant",owner:"Identity administration"},
  class_no_lessons: {label:"Class has no lesson records",owner:"Course publisher"},
  class_minimal_lesson_inventory: {label:"Class has one to three lesson records",owner:"Course publisher"},
  class_no_track_presentations: {label:"Class has no linked track presentations",owner:"Instructional content reviewer"},
  synthetic_course_in_active_enrollment: {label:"Active synthetic curriculum enrollment",owner:"Academic readiness reviewer"},
  active_demo_noncredit_mode: {label:"Synthetic noncredit demonstration enrollment",owner:"Registrar / academic authority"},
};
export function PlatformAcademicIntegrity({integrity}:{integrity:Integrity}){
  return <WorkspacePanel title="Academic data integrity" className="mt-6"
    description="Database-wide aggregate inventory by Site. Findings identify review work; they do not authorize enrollment changes, instruction publication or academic credit.">
    {integrity.status==="unavailable"?<WorkspaceNotice tone="attention">
      Academic integrity could not be checked. Do not interpret an unavailable inventory as a clean release.
    </WorkspaceNotice>:<>
      <p className="text-xs text-muted-foreground">Checked {integrity.checkedAt}. Counts overlap. Recovery matching applies to the recorded Valor fixture convention; missing matches elsewhere require independent reconciliation. Small lesson counts and missing recorded presentations are review signals, not proof of invalid delivery.</p>
      <DirectoryTable label="Academic integrity findings" caption="Site-scoped findings and responsible workflows."
        rows={integrity.findings} rowKey={item=>item.code+":"+(item.siteId??"unassigned")}
        empty={<p className="p-4 text-sm text-muted-foreground">No findings detected by the current checks. This does not certify complete academic readiness.</p>}
        columns={[
          {id:"priority",title:"Priority",render:item=><StatusBadge tone={item.priority==="P0"?"attention":"neutral"}>{item.priority}</StatusBadge>},
          {id:"finding",title:"Finding",render:item=>remediation[item.code]?.label??item.code},
          {id:"site",title:"Site",render:item=><div>{item.siteName}<p className="text-xs text-muted-foreground break-all">{item.siteId??"Unassigned"}</p></div>},
          {id:"affected",title:"Affected",render:item=>item.affected},
          {id:"owner",title:"Review owner",render:item=>remediation[item.code]?.owner??"Platform operations"},
        ]}/>
    </>}
  </WorkspacePanel>;
}

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DirectoryTable, StatusBadge, WorkspaceNotice, WorkspacePanel, StatCard } from "@/components/workspace";
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
  legacy_assessment_records_to_reconcile: {label:"Legacy assessment inventory",owner:"Academic data migration"},
  legacy_submission_records_to_reconcile: {label:"Legacy submission inventory",owner:"Academic data migration"},
  legacy_grade_records_to_reconcile: {label:"Legacy grade inventory",owner:"Registrar / academic authority"},
  legacy_schedule_records_to_reconcile: {label:"Legacy schedule inventory",owner:"Site operations"},
  legacy_progress_records_to_reconcile: {label:"Legacy lesson progress inventory",owner:"Learning engineering"},
  native_submission_course_mismatch: {label:"Native submission Course mismatch",owner:"Learning engineering"},
  native_progress_course_mismatch: {label:"Native lesson progress Course mismatch",owner:"Learning engineering"},
  active_grant_account_person_mismatch: {label:"Active grant account / Person mismatch",owner:"Identity administration"},
  active_grant_site_org_mismatch: {label:"Active grant Site / Organization mismatch",owner:"Identity administration"},
  active_grant_disabled_principal: {label:"Active grant for disabled account or inactive Person",owner:"Identity administration"},
  site_lifecycle_unclassified: {label:"Site lifecycle not classified",owner:"Site operations"},
  site_geography_reference_missing: {label:"Site geography reference absent",owner:"Geographic data steward"},
  site_organization_lifecycle_unclassified: {label:"Site owning Organization lifecycle not classified",owner:"Organization operations"},
  organization_lifecycle_unclassified: {label:"Organization lifecycle not classified",owner:"Organization operations"},
  active_demo_noncredit_mode: {label:"Synthetic noncredit demonstration enrollment",owner:"Registrar / academic authority"},
};
export function PlatformAcademicIntegrity({integrity}:{integrity:Integrity}){
  const [filter,setFilter]=useState("");
  const visible=integrity.findings.filter(item=>[item.code,item.siteName,item.siteId??"",item.priority,remediation[item.code]?.label??"",remediation[item.code]?.owner??""].some(value=>value.toLowerCase().includes(filter.trim().toLowerCase())));
  return <WorkspacePanel title="Data integrity" className="mt-6"
    description="Database-wide aggregate inventory by Site. Findings identify review work; they do not authorize enrollment changes, instruction publication or academic credit.">
    {integrity.status==="unavailable"?<WorkspaceNotice tone="attention">
      Data integrity could not be checked. Do not interpret an unavailable inventory as a clean release.
    </WorkspaceNotice>:<>
      <p className="text-xs text-muted-foreground">Checked {integrity.checkedAt}. Counts overlap. Recovery matching applies to the recorded Valor fixture convention; missing matches elsewhere require independent reconciliation. Small lesson counts and missing recorded presentations are review signals, not proof of invalid delivery.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <StatCard label="P0 finding groups" value={integrity.findings.filter(item=>item.priority==="P0").length}/>
        <StatCard label="P1 finding groups" value={integrity.findings.filter(item=>item.priority==="P1").length}/>
        <StatCard label="Sites with findings" value={new Set(integrity.findings.flatMap(item=>item.siteId?[item.siteId]:[])).size}/>
      </div>
      <WorkspaceNotice className="mt-4">Legacy record inventories are preservation and reconciliation workloads, not proven missing or corrupt records. Geography and lifecycle gaps require evidence-based review.</WorkspaceNotice>
      <div className="mt-4 max-w-lg"><Label htmlFor="integrity-filter">Filter findings</Label><Input id="integrity-filter" type="search" value={filter} onChange={event=>setFilter(event.target.value)} placeholder="Site, priority, finding or owner"/></div>
      <DirectoryTable label="Data integrity findings" caption="Site and platform-scoped findings and responsible workflows."
        rows={visible} rowKey={item=>item.code+":"+(item.siteId??"unassigned")}
        empty={<p className="p-4 text-sm text-muted-foreground">{filter?"No findings match this filter.":"No findings detected by the current checks. This does not certify complete platform readiness."}</p>}
        columns={[
          {id:"priority",title:"Priority",render:item=><StatusBadge tone={item.priority==="P0"?"attention":"neutral"}>{item.priority}</StatusBadge>},
          {id:"finding",title:"Finding",render:item=>remediation[item.code]?.label??item.code},
          {id:"site",title:"Site",render:item=><div>{item.siteId?item.siteName:"Platform-wide"}<p className="text-xs text-muted-foreground break-all">{item.siteId??"Aggregate / no Site"}</p></div>},
          {id:"affected",title:"Affected",render:item=>item.affected},
          {id:"owner",title:"Review owner",render:item=>remediation[item.code]?.owner??"Platform operations"},
        ]}/>
    </>}
  </WorkspacePanel>;
}

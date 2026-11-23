import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, StatusBadge, WorkspaceNotice, WorkspacePanel } from "@/components/workspace";
import { projectPublisherReleaseNextStep,
  type NativePublisherReleaseRecord,
  type PublisherReleaseNextStep } from "@/domain/native-publisher-release-readiness";

/** Maps already-recorded readiness to the original owning workflow.
 * There is no separate approval table, superuser override or fabricated status.
 */
const nextWorkspace: Record<PublisherReleaseNextStep["key"], {
  url:string; label:string; owner:string;
}> = {
  composition: {url:"/class?view=content",label:"Open Course authoring",owner:"Course creator"},
  "creator-membership": {url:"/platform",label:"Review owner access",owner:"Platform Owner / authorized staffing"},
  "reviewer-membership": {url:"/platform",label:"Review owner access",owner:"Platform Owner / independent reviewer appointment"},
  evidence: {url:"/class?view=reviews",label:"Review publisher evidence",owner:"Independent reviewer"},
  "creator-appointment": {url:"/class?view=content",label:"Inspect creator access",owner:"Publisher staffing authority"},
  "reviewer-appointment": {url:"/class?view=reviews",label:"Inspect reviewer access",owner:"Publisher staffing authority"},
  "course-publication": {url:"/class?view=reviews",label:"Open Course review queue",owner:"Appointed independent Course reviewer"},
  policy: {url:"/class?view=reviews",label:"Review release requirements",owner:"Appointed publisher reviewer"},
  assets: {url:"/class?view=content",label:"Open content authoring",owner:"Appointed Course creator"},
  "asset-approval": {url:"/class?view=reviews",label:"Review submitted assets",owner:"Appointed independent reviewer"},
  "offering-publication": {url:"/class?view=reviews",label:"Open Offering release queue",owner:"Appointed publisher reviewer"},
  adoption: {url:"/canonical/program-operations",label:"Review Site adoption",owner:"Authorized local operator"},
  "class-verification": {url:"/class?view=manage",label:"Verify Class delivery",owner:"Authorized Site operator"},
};

export function PlatformReleaseCenter({records,limited}:{
  records:readonly NativePublisherReleaseRecord[];
  limited:boolean;
}){
  const [query,setQuery]=useState("");
  const items=useMemo(()=>records.map(record=>({
    record, next:projectPublisherReleaseNextStep(record),
  })).sort((a,b)=>{
    const pa=a.record.lifecycle==="published"?1:0;
    const pb=b.record.lifecycle==="published"?1:0;
    return pa-pb||a.record.offeringTitle.localeCompare(b.record.offeringTitle);
  }),[records]);
  const shown=items.filter(item=>item.record.offeringTitle.toLowerCase().includes(query.trim().toLowerCase()));
  const blocked=items.filter(item=>item.next.key!=="class-verification").length;
  return <WorkspacePanel title="Release Center" className="mt-6"
    description="One place to triage real publisher prerequisites and navigate to the authorized owner. This is operational coordination, not blanket approval authority.">
    <div className="mt-2 grid gap-3 sm:grid-cols-3">
      <div className="border border-border p-3">
        <p className="text-xs text-muted-foreground">Offering versions inspected</p>
        <p className="text-2xl font-semibold tabular-nums">{items.length}</p>
      </div>
      <div className="border border-border p-3">
        <p className="text-xs text-muted-foreground">Require publisher follow-up</p>
        <p className="text-2xl font-semibold tabular-nums">{blocked}</p>
      </div>
      <div className="border border-border p-3">
        <p className="text-xs text-muted-foreground">Past basic publication gates</p>
        <p className="text-2xl font-semibold tabular-nums">{items.length-blocked}</p>
      </div>
    </div>
    <WorkspaceNotice className="mt-4">
      Inventory is limited to the first 25 Offering versions and cannot prove that any
      person currently holds a valid reviewer appointment. Approvals remain with their owning services.
      A Platform Owner can View as an eligible reviewer, but cannot fake an independent decision.
    </WorkspaceNotice>
    {limited&&<WorkspaceNotice tone="attention" className="mt-3">
      More than 25 versions exist. The inventory is incomplete. Narrower authorized queries
      are required before making a platform-wide release claim.
    </WorkspaceNotice>}
    <div className="mt-5 max-w-lg">
      <Label htmlFor="platform-release-filter" className="mb-2 block">Filter Offering versions</Label>
      <Input id="platform-release-filter" type="search" value={query}
        onChange={event=>setQuery(event.target.value)}
        placeholder="Search by Course or Offering title"/>
    </div>
    <div className="mt-4 space-y-3">
      {shown.map(({record,next})=>{
        const route=nextWorkspace[next.key];
        return <article key={record.offeringVersionId} className="border border-border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-semibold">{record.offeringTitle}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Version {record.versionNo} · {record.lifecycle.replaceAll("_"," ")} ·
                {" "}{record.publishedCourses}/{record.courseCount} Courses published
              </p>
            </div>
            <StatusBadge tone={next.key==="class-verification"?"info":"attention"}>
              {next.label}
            </StatusBadge>
          </div>
          <p className="mt-3 text-sm">{next.detail}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Responsible: {route.owner}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Creator appointments {record.creatorAppointedCourses}/{record.courseCount} ·
            {" "}Reviewer appointments {record.reviewerAppointedCourses}/{record.courseCount} ·
            {" "}Evidence records {record.currentEvidenceRecords} ·
            {" "}Manifest {record.manifestStatus??"not submitted"}
          </p>
          {next.key!=="creator-membership"&&next.key!=="reviewer-membership"&&
            <a href={route.url} className="mt-3 inline-flex text-sm font-semibold text-primary underline">
              {route.label} (requires authorized role)
            </a>}
        </article>;
      })}
      {!shown.length&&<EmptyState title={query?"No versions match":"No Offering versions found"}
        description="Only versions in the current verified platform inventory can appear here."/>}
    </div>
  </WorkspacePanel>;
}

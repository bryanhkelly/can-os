import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { StatCard, StatusBadge, WorkspaceNotice, WorkspacePanel, WorkQueue, type WorkQueueItem } from "@/components/workspace";
import { projectPublisherReleaseNextStep, projectNoncreditPilotBlockers,
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
    const priority=(record:NativePublisherReleaseRecord)=>
      record.offeringCode==="CLC-CUSTOM-TRAINING-01"||record.offeringCode==="CLC-DIGITAL-01"?0:1;
    return priority(a.record)-priority(b.record) || pa-pb ||
      a.record.offeringTitle.localeCompare(b.record.offeringTitle);
  }),[records]);
  const shown=items.filter(item=>[item.record.offeringTitle,item.record.offeringCode??""].some(value=>value.toLowerCase().includes(query.trim().toLowerCase())));
  const blocked=items.filter(item=>item.next.key!=="class-verification" || (!!item.record.noncreditTrainingStatus && projectNoncreditPilotBlockers(item.record).length>0)).length;
  return <WorkspacePanel title="Release Center" className="mt-6"
    description="One place to triage real publisher prerequisites and navigate to the authorized owner. This is operational coordination, not blanket approval authority.">
    <div className="mt-2 grid gap-3 sm:grid-cols-3">
      <StatCard label="Offering versions inspected" value={items.length}/>
      <StatCard label="Require publisher follow-up" value={blocked}/>
      <StatCard label="Past basic publication gates" value={items.length-blocked}/>
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
    <Field label="Filter Offering versions" className="mt-5 max-w-lg">
      <Input id="platform-release-filter" type="search" value={query}
        onChange={event=>setQuery(event.target.value)}
        placeholder="Search by Course or Offering title"/>
    </Field>
    <WorkQueue title="Offering version review" countLabel="shown" limited={limited} empty={query?"No versions match":"No Offering versions found"}
      description="Only versions in the current verified platform inventory can appear here."
      items={shown.map(({record,next}):WorkQueueItem=>{
        const route=nextWorkspace[next.key];
        const pilotBlockers=record.noncreditTrainingStatus?projectNoncreditPilotBlockers(record):[];
        return {id:record.offeringVersionId, title:record.offeringTitle, category:`Version ${record.versionNo} · ${record.lifecycle.replaceAll("_"," ")} · ${record.publishedCourses}/${record.courseCount} Courses published`, priority:"normal", status:<StatusBadge tone={next.key==="class-verification"&&!pilotBlockers.length?"info":"attention"}>{pilotBlockers.length&&next.key==="class-verification"?"Noncredit prerequisites outstanding":next.label}</StatusBadge>, context:<>
          {record.noncreditTrainingStatus&&<p className="mt-3 text-sm">
            <strong>Noncredit training:</strong> {record.noncreditTrainingStatus}.
            {" "}<strong>Assessment:</strong> {record.noncreditAssessmentStatus??"unverified"}.
            {" "}<strong>Independent training approval:</strong> {record.noncreditTrainingApproved?"recorded":"missing"}.
            {" "}<strong>Lesson review:</strong> {record.pilotPlaceholderCount??0} media placeholders,
            {" "}{record.pilotContentReviewCount??0} content-review flags
            in {record.pilotLessonCount??0} lessons.
          </p>}
          {pilotBlockers.length>0&&<WorkspaceNotice tone="attention" className="mt-3"><p className="text-sm font-semibold">Noncredit readiness blockers</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{pilotBlockers.map(blocker=><li key={blocker}>{blocker}</li>)}</ul><a className="mt-2 inline-block text-sm underline" href={"/programs/noncredit/enrollment?offeringCode="+encodeURIComponent(record.offeringCode??"")}>Inspect registration operations (authorized provider)</a><p className="mt-2 text-xs text-muted-foreground">A recorded open window does not prove eligibility, capacity or permission.</p></WorkspaceNotice>}
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
        </>, actions:next.key!=="creator-membership"&&next.key!=="reviewer-membership"?
            <a href={route.url} className="text-sm font-semibold text-primary underline">{route.label} (requires authorized role)</a>:undefined};
      })}/>
  </WorkspacePanel>;
}

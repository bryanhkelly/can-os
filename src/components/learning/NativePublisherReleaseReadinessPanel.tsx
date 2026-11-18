import {
  DirectoryTable, EmptyState, StatusBadge, WorkspaceNotice, WorkspacePanel,
} from "@/components/workspace";
import {
  projectPublisherReleaseNextStep,
  type NativePublisherReleaseRecord,
} from "@/domain/native-publisher-release-readiness";

/**
 * v6.1 platform-admin operational diagnostics. No private learner/person data,
 * identity references, action buttons or fake authorization are rendered.
 * These are record counts, NOT a substitute for Course-specific server checks.
 */
export function NativePublisherReleaseReadinessPanel({
  records,limited,
}:{
  records:readonly NativePublisherReleaseRecord[];
  limited:boolean;
}){
  return <WorkspacePanel title="Native Course and Offering release readiness"
    className="mt-6"
    description="Review the next missing publisher record across Course creation, independent review, Offering publication and local adoption. Records are not approval decisions.">
    {limited&&<WorkspaceNotice tone="attention">
      Showing the first 25 Offering versions. This inventory is incomplete;
      do not infer global readiness or absence from this page.
    </WorkspaceNotice>}
    <DirectoryTable label="Publisher release prerequisites"
      caption="Current publisher records, as observed by a verified App Admin. Exact independent grants, evidence validity and Class authority are checked by their owning services."
      rows={[...records]}
      rowKey={record=>record.offeringVersionId}
      empty={<EmptyState title="No native Offering versions"
        description="No publisher Offering versions are present in the current authorized inventory. This does not create a Course, appoint staff or authorize an Offering."
      />}
      columns={[
        {id:"offering",title:"Offering version",render:record=>
          <div className="min-w-44">
            <p className="font-semibold">{record.offeringTitle}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Version {record.versionNo} · {record.lifecycle.replaceAll("_"," ")}
            </p>
          </div>},
        {id:"course",title:"Native Courses",render:record=>
          <div className="text-sm tabular-nums">
            <p>{record.publishedCourses}/{record.courseCount} published</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Creator appointments {record.creatorAppointedCourses}/{record.courseCount}
            </p>
            <p className="text-xs text-muted-foreground">
              Reviewer appointments {record.reviewerAppointedCourses}/{record.courseCount}
            </p>
          </div>},
        {id:"release",title:"Publication evidence",render:record=>
          <div className="text-sm">
            <p>{record.releasePolicies}/{record.courseCount} policy records</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {record.releaseAssets} pinned asset uses ·
              {" "}{record.manifestStatus??"No content manifest"}
            </p>
          </div>},
        {id:"adoption",title:"Local adoption",render:record=>
          <p className="text-sm tabular-nums">
            {record.approvedAdoptions} recorded approval(s)
          </p>},
        {id:"action",title:"Next record to verify",render:record=>{
          const next=projectPublisherReleaseNextStep(record);
          return <div className="max-w-72">
            <StatusBadge tone={next.key==="class-verification"?"info":"attention"}>
              {next.label}
            </StatusBadge>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {next.detail}
            </p>
          </div>;
        }},
      ]}
    />
    <WorkspaceNotice className="mt-4">
      Active creator memberships, reviewer memberships and verified evidence
      are separate prerequisites from Course appointments. The figures above
      show recorded Course appointments only, not whether the same person's
      role, evidence and capability are currently authorized. This view cannot
      grant permissions, publish content or open enrollment.
    </WorkspaceNotice>
  </WorkspacePanel>;
}

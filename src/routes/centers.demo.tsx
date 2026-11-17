import { createFileRoute, Link } from "@tanstack/react-router";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import {
  PageFrame, RecordHeader, RecordLayout, RecordFacts, WorkspaceNotice, WorkspacePanel, StatusBadge,
} from "@/components/workspace";
import { getDemoCenter } from "@/modules/activities/demo-center.functions";
import { SiteNativeClassHandoff } from "@/components/launch-studio/SiteNativeClassHandoff";

export const Route = createFileRoute("/centers/demo")({
  loader: safeLoader(() => getDemoCenter()),
  component: DemoCenterPage,
});

/** Synthetic Site planning preview, not a second Class directory or teacher
 * workspace. Every real Class opens through the authoritative /class routes. */
function DemoCenterPage() {
  const result=Route.useLoaderData();
  if (!result.ok) return <LoaderFailure eyebrow="Community learning" title="Center" outcome={result}/>;
  if (!result.data) return <PageFrame width="wide"><p role="status">Center not found.</p></PageFrame>;
  const {site,plans,nativeCourse,nativeCourseLessons,nativeRollout}=result.data;
  const totalPlannedMinutes=nativeCourseLessons.reduce(
    (sum,lesson)=>sum+(lesson.estimatedMinutes??0),0);
  return <PageFrame width="wide">
    <RecordLayout header={<RecordHeader eyebrow="Community Learning Center · Synthetic demonstration"
      title={site.name} subtitle="After-school and summer program planning"/>}
      main={<div className="space-y-5">
      <WorkspacePanel title="Explore Classes and programs"
        description="One Class directory for enrollment, teaching, sessions and management.">
        <p className="text-sm leading-6 text-muted-foreground">
          These saved program plans are not native Classes or enrollable seats.
          To teach the recorded AI lesson, an authorized publisher must publish
          a Course and an operator must establish a Class and its required approvals.
          The teacher then opens the actual Class, not a separate demo classroom.
        </p>


        <Link to="/class" search={{}} className="mt-4 inline-flex min-h-11 items-center border border-border px-4 py-3 text-sm font-semibold">
          Explore available Classes
        </Link>
        <Link to="/class" search={{view:"manage",siteId:site.id}} className="mr-3 mt-4 inline-flex min-h-11 items-center border border-border px-4 py-3 text-sm font-semibold">
          Manage Classes (authorized staff)
        </Link>
        <Link to="/class" search={{view:"content"}}
          className="mt-4 inline-flex min-h-11 items-center border border-border px-4 py-3 text-sm font-semibold">
          Instructional content (authorized creator)
        </Link>
      </WorkspacePanel>
      <WorkspaceNotice tone="info">
        Program plans persist in the database, but no Class Enrollment, authorized
        teaching Session or safety approval is implied by these records.
        A native Class requires a published Course and approved adoption.
      </WorkspaceNotice>
      <WorkspacePanel title="Native Course and lesson sequence"
        description="Source-backed educational content, separate from Activity plans and Class enrollment.">
        {!nativeCourse?<p role="status" className="text-sm">
          The education Course draft is not available in the database.
        </p>:<div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <strong className="text-base">{nativeCourse.title}</strong>
            <StatusBadge tone="neutral">Course version: {nativeCourse.lifecycle}</StatusBadge>
          </div>
          <RecordFacts variant="tiles" columns={3} label="Native Course details" items={[
            {label:"Course code",value:nativeCourse.courseCode},
            {label:"Planned lessons",value:nativeCourseLessons.length},
            {label:"Planned instruction",value:totalPlannedMinutes+" minutes"},
            {label:"Release status",value:nativeCourse.lifecycle==="published"?"Published":"Not published"},
          ]}/>
          <ol aria-label="Draft Course lesson sequence"
            className="divide-y divide-border border border-border">
            {nativeCourseLessons.map(lesson=><li key={lesson.id}
              className="flex flex-wrap items-start justify-between gap-3 p-3">
              <span><span className="mr-2 text-xs font-semibold text-muted-foreground">
                {lesson.lessonOrder}.
              </span>{lesson.title}</span>
              <span className="text-xs text-muted-foreground">
                {lesson.estimatedMinutes==null?"Duration not set":lesson.estimatedMinutes+" min"}
              </span>
            </li>)}
          </ol>
          <p className="text-xs text-muted-foreground">
            These are unpublished lesson outlines, not scheduled Class Sessions.
          </p>
          <p className="text-muted-foreground">
            This Course exists in the native education schema. Its version must
            complete independent publication and be adopted by this Site
            before a Class can be created or enrollment opened.
          </p>
          <Link to="/class" search={{view:"content"}}
            className="inline-flex min-h-11 items-center border border-border px-4 py-3 font-semibold">
            Open instructional content workspace (authorized creator)
          </Link>
        </div>}
      </WorkspacePanel>
            <WorkspacePanel title="Course rollout and local adoption"
        description="The native publication and deployment chain for this center. Planning records do not grant classroom authority.">
        {!nativeRollout?<p role="status" className="text-sm">
          No native Course rollout is linked to this center.
        </p>:<>
          <RecordFacts columns={2} variant="tiles" label="Rollout status"
            items={[
              {label:"Learning center Operation",value:nativeRollout.operationStatus},
              {label:"Publisher Offering version",value:nativeRollout.offeringLifecycle},
              {label:"Local Deployment",value:nativeRollout.deploymentStatus},
              {label:"Course adoption",value:nativeRollout.adoptionStatus},
            ]}/>
          <p className="mt-4 text-sm text-muted-foreground">
            Independent Course and Offering publication, Site readiness,
            operator authorization, and adoption approval must be complete
            before a Class can be created. A proposed adoption is not approval.
          </p>
        </>}
      </WorkspacePanel>
      <SiteNativeClassHandoff publicSiteId={site.id}/>
      <div className="grid gap-4 md:grid-cols-2">
        {plans.map(plan=><WorkspacePanel key={plan.seasonId}
          title={plan.activityName} description={plan.programName}>
          <div className="space-y-3 text-sm">
            <p>{plan.startsOn} to {plan.endsOn}</p>
            <p>Planned capacity: {plan.capacity??"Not set"}</p>
            <StatusBadge tone="neutral">Activity planning: {plan.status}</StatusBadge>
            <p className="text-muted-foreground">
              A plan is not an open native Class Offering. Use the Class
              workspace to publish and enroll in an authorized Class.
            </p>
          </div>
        </WorkspacePanel>)}
      </div>
    </div>}/>
  </PageFrame>;
}

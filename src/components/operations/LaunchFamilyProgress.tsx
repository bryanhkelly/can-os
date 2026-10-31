import { Link } from "@tanstack/react-router";
import { FamilyInviteImporter } from "@/components/operations/FamilyInviteImporter";
import type { listFamilyInvitations } from "@/modules/enrollment/family-invitations.functions";
import type { getLaunchAdmissionsCounts } from "@/modules/enrollment/launch-admissions-counts.functions";
import type { getActiveEnrollmentCounts } from "@/modules/enrollment/admissions-dashboard.functions";

export function LaunchFamilyProgress({ admissionsCounts, enrollmentCounts, familyInvitations, siteId, programId }: {
  admissionsCounts: Awaited<ReturnType<typeof getLaunchAdmissionsCounts>> | null;
  enrollmentCounts: Awaited<ReturnType<typeof getActiveEnrollmentCounts>> | null;
  familyInvitations: Awaited<ReturnType<typeof listFamilyInvitations>> | null;
  siteId?: string;
  programId?: string;
}) {
  const scopedBatches=familyInvitations?.batches.filter(batch=>
    (!programId||batch.programId===programId)&&(!siteId||batch.siteId===siteId))??[];
  const queued=scopedBatches.reduce((count,batch)=>count+batch.recipients.filter(recipient=>recipient.status==="queued"||recipient.status==="retrying").length,0);
  const providerAccepted=scopedBatches.reduce((count,batch)=>count+batch.recipients.filter(recipient=>recipient.status==="provider_accepted").length,0);
  const responded=scopedBatches.reduce((count,batch)=>count+batch.recipients.filter(recipient=>recipient.status==="responded").length,0);
  const failedBatches=scopedBatches.filter(batch=>batch.outboxStatus==="failed").length;
  return <>
        {admissionsCounts&&<section aria-label="Admissions progress" className="mt-5 rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold">Admissions progress</h2>
          <p className="mt-1 text-xs text-muted-foreground">Current application records for the selected school; invitation responses are tracked separately.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <p className="rounded-lg border p-3 text-sm"><strong className="block text-2xl">{admissionsCounts.total}</strong>Applications recorded</p>
            <p className="rounded-lg border p-3 text-sm"><strong className="block text-2xl">{admissionsCounts.accepted}</strong>Accepted applications</p>
            <p className="rounded-lg border p-3 text-sm"><strong className="block text-2xl">{admissionsCounts.awaiting}</strong>Awaiting decision</p>
          </div>
        </section>}
        {enrollmentCounts&&<section aria-label="Confirmed student enrollment" className="mt-3 rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold">Confirmed enrollment</h2>
          <p className="mt-1 text-xs text-muted-foreground">Distinct students with active program enrollments, including those enrolled without an admissions application. Counts are across authorized programs when no program is selected.</p>
          <p className="mt-3 text-sm"><strong className="mr-2 text-2xl">{enrollmentCounts.filter(row=>!programId||row.programId===programId).reduce((total,row)=>total+row.activeStudents,0)}</strong>Active program enrollments</p>
          <Link to="/admissions" search={{siteId:siteId,programId:programId,application:undefined}} className="mt-2 inline-block text-sm font-semibold underline">Review enrollment records</Link>
        </section>}
        <nav aria-label="Family enrollment handoff" className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
          <span className="text-sm font-semibold">After inviting families</span>
          <Link to="/admissions/intake" search={{siteId:siteId,programId:programId}}
            className="text-sm font-semibold underline">Review inquiries and applications</Link>
          <Link to="/admissions" search={{siteId:siteId,programId:programId,application:undefined}}
            className="text-sm font-semibold underline">Manage offers and enrollment</Link>
        </nav>
        <section aria-label="Saved family invitation progress" className="mt-5 rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold">Outreach recorded for this school</h2>
          {familyInvitations?<div className="mt-3 grid gap-3 sm:grid-cols-4">
            <p className="rounded-lg border p-3 text-sm"><strong className="block text-2xl">{scopedBatches.length}</strong>Saved invitation batches</p>
            <p className="rounded-lg border p-3 text-sm"><strong className="block text-2xl">{queued}</strong>Queued or retrying</p>
            <p className="rounded-lg border p-3 text-sm"><strong className="block text-2xl">{providerAccepted}</strong>Accepted by provider</p>
            <p className="rounded-lg border p-3 text-sm"><strong className="block text-2xl">{responded}</strong>Responses recorded</p>
          </div>:<p role="status" className="mt-2 text-sm">Invitation history is unavailable. Do not assume outreach was sent.</p>}
          {failedBatches>0&&<p role="status" className="mt-3 text-sm">{failedBatches} invitation batch{failedBatches===1?"":"es"} need delivery review. Use the saved batch retry action below.</p>}
          <p className="mt-2 text-xs text-muted-foreground">Provider acceptance is not confirmed inbox delivery. A family response is not an enrollment or opening authorization.</p>
        </section>
        <details open className="mt-5 rounded-xl border bg-card p-5">
          <summary className="cursor-pointer text-sm font-semibold">Family invitations and outreach progress</summary>
          <FamilyInviteImporter key={`${siteId ?? ""}:${programId ?? ""}`} workspace={familyInvitations} selectedProgramId={programId} selectedSiteId={siteId}/>
        </details>


  </>;
}

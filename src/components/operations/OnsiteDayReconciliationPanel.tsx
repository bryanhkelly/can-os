import { useEffect, useState } from "react";
import { deriveOnsiteDayReconciliation } from "@/domain/onsite-day-reconciliation";
import type { listExpectedOnsiteRoster } from "@/modules/attendance/onsite-attendance-workflow.functions";
import {
  attestOnsiteDayReview, getOnsiteDayReview,
} from "@/modules/operations/onsite-day-review.functions";

type Roster = Awaited<ReturnType<typeof listExpectedOnsiteRoster>>;
type Review = Awaited<ReturnType<typeof getOnsiteDayReview>>;

/**
 * Reconciles scheduled attendance entries. A site leader may attest to the
 * current snapshot; the official attendance ledger remains editable/audited.
 * No automatic absences, student release, supervision certification or
 * undocumented "end of day" closure.
 */
export function OnsiteDayReconciliationPanel({date,roster,refreshRevision=0}:{
  date:string;roster:Roster;refreshRevision?:number;
}) {
  const summary=deriveOnsiteDayReconciliation(roster.programs,roster.students);
  const [review,setReview]=useState<Review|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [confirmed,setConfirmed]=useState(false);
  const [error,setError]=useState("");
  const [refresh,setRefresh]=useState(0);

  useEffect(()=>{
    let live=true;
    setReview(null);setLoading(true);setConfirmed(false);setError("");
    void getOnsiteDayReview({data:{date}}).then(response=>{
      if(!live)return;
      setReview(response);setLoading(false);
    }).catch(()=>{
      if(!live)return;
      setLoading(false);
      setError("Unable to check the latest attendance review. No closure status is assumed.");
    });
    return ()=>{live=false};
  },[date,roster,refresh,refreshRevision]);

  const ready=summary.readyForAttendanceReview &&
    review?.readyForAttendanceReview===true && review.unresolvedIssues===0;
  return <section aria-label="Daily attendance reconciliation" className="mt-9 rounded-xl border p-5">
    <h2 className="font-serif text-2xl">Daily attendance reconciliation</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      Confirm scheduled student-program entries against official staff-recorded onsite marks.
      Missing marks remain unrecorded, never automatically absent. Guardian excuses and
      student release follow separate approved processes.
    </p>
    <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
      <p className="rounded border p-3">Expected entries
        <strong className="mt-1 block text-2xl">{summary.expectedEntries}</strong></p>
      <p className="rounded border p-3">Recorded marks
        <strong className="mt-1 block text-2xl">{summary.markedEntries}</strong></p>
      <p className="rounded border p-3">Unrecorded
        <strong className="mt-1 block text-2xl">{summary.unrecordedEntries}</strong></p>
      <p className="rounded border p-3">Issues
        <strong className="mt-1 block text-2xl">{summary.issues.length}</strong></p>
    </div>
    {review?.custody&&<div className="mt-4 rounded-lg border p-4" aria-label="Custody release evidence summary">
      <h3 className="text-sm font-semibold">Linked custody evidence</h3>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <p>Present / tardy<strong className="mt-1 block text-xl">{review.custody.presentEntries}</strong></p>
        <p>Verified releases<strong className="mt-1 block text-xl">{review.custody.releasedEntries}</strong></p>
        <p>Awaiting release<strong className="mt-1 block text-xl">{review.custody.pendingReleaseEntries}</strong></p>
        <p>Open follow-ups<strong className="mt-1 block text-xl">{review.custody.uncollectedFollowUps}</strong></p>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{review.custody.deniedAttempts} denied pickup attempt(s) are linked to this snapshot. Pending release does not block an attendance-only attestation and never implies departure.</p>
    </div>}
    <p className="mt-3 text-xs text-muted-foreground">
      {summary.distinctStudentCount} distinct students across {summary.programs.length} program(s).
      Counts are program-attendance entries; they are not a physical headcount.
    </p>
    {summary.issues.length>0&&<>
      <h3 className="mt-4 font-semibold">Outstanding review items</h3>
      <ul className="mt-2 list-inside list-disc text-sm">
        {summary.issues.slice(0,20).map((item,i)=>
          <li key={item.programId+":"+(item.studentProfileId??"site")+":"+item.kind+":"+i}>
            {item.label}
          </li>)}
      </ul>
      {summary.issues.length>20&&<p className="mt-2 text-xs">
        Showing 20 of {summary.issues.length} issues. Resolve the full list in the official roster.
      </p>}
    </>}
    {summary.notReadyReason&&<p role="status" className="mt-3 text-sm">
      Attendance review is not ready: {summary.notReadyReason}.
    </p>}
    {loading&&<p role="status" className="mt-3 text-sm">
      Checking whether this attendance snapshot has been reviewed…
    </p>}
    {error&&<p role="alert" className="mt-3 text-sm">{error}</p>}
    {review&&<>
      {!review.coversAllPrograms&&<p role="status" className="mt-3 rounded border p-3 text-sm">
        Your current program grant does not cover every active onsite program at this site.
        This is a partial program reconciliation, not a site-wide closeout.
        Contact the school registrar for full scope.
      </p>}
      <p className="mt-4 text-sm font-semibold" role="status">
        {review.status==="reviewed_snapshot"
          ? "Site leader reviewed this attendance snapshot"
          :review.status==="stale_after_changes"
            ? "Earlier review is outdated after attendance or schedule changes"
            :"No site leader attendance review recorded for this snapshot"}
      </p>
      {review.reviewedAt&&<p className="mt-1 text-xs text-muted-foreground">
        Last reviewed: {new Date(review.reviewedAt).toLocaleString()}
      </p>}
      {review.canAttest && review.status!=="reviewed_snapshot"&&<>
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input type="checkbox" checked={confirmed}
            onChange={event=>setConfirmed(event.target.checked)} disabled={busy||!ready} />
          I reviewed the expected roster, official attendance records and schedule gaps
          for this date. This records a snapshot review, not student release or
          a final lock of attendance.
        </label>
        <button type="button" disabled={!ready||!confirmed||busy}
          className="mt-3 rounded border px-4 py-2 text-sm font-semibold disabled:opacity-50"
          onClick={async()=>{
            if(!ready||busy||!confirmed)return;
            setBusy(true);setError("");
            try{
              await attestOnsiteDayReview({data:{date,confirmedRecordsReviewed:true as const}});
              setConfirmed(false);setRefresh(n=>n+1);
            }catch{
              setError("Review could not be recorded. Refresh attendance and check unresolved issues.");
            }finally{setBusy(false)}
          }}>{busy?"Recording review…":"Record site leader attendance review"}</button>
      </>}
    </>}
    <p className="mt-4 text-xs text-muted-foreground">{summary.note}</p>
  </section>;
}

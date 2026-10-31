import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { getFirstSchoolDayHandoff } from "@/modules/enrollment/first-school-day-handoff.functions";

type Result = Awaited<ReturnType<typeof getFirstSchoolDayHandoff>>;

/** Read-only verification, never a claim of physical supervision or release. */
export function FirstSchoolDayHandoff({applicationId,programId}:{
  applicationId:string;programId:string;
}){
  return <FirstSchoolDayForApplication key={applicationId} applicationId={applicationId}
    programId={programId}/>;
}
function FirstSchoolDayForApplication({applicationId,programId}:{
  applicationId:string;programId:string;
}){
  const [result,setResult] = useState<Result|null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [refresh,setRefresh] = useState(0);
  useEffect(()=>{
    let live=true;
    setResult(null);setLoading(true);setError("");
    void getFirstSchoolDayHandoff({data:{applicationId}})
      .then(value=>{if(live)setResult(value);})
      .catch(()=>{if(live)setError("The current onsite roster or supervision plan could not be verified. Do not assume the student is expected or supervised.");})
      .finally(()=>{if(live)setLoading(false);});
    return ()=>{live=false;};
  },[applicationId,refresh]);

  return <section aria-label="Verified first-day handoff" className="mt-4 rounded-lg border p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="font-semibold">Verify the student's next supervised school day</h4>
      <button type="button" className="rounded border px-2 py-1 text-xs"
        disabled={loading} onClick={()=>setRefresh(value=>value+1)}>
        {loading?"Checking…":"Recheck"}
      </button>
    </div>
    {loading&&<p role="status" className="mt-2">Checking the live school-local calendar, this student's expected roster and independently reviewed supervision plan…</p>}
    {error&&<p role="alert" className="mt-2">{error}</p>}
    {result&&<>
      <p className="mt-2 text-xs text-muted-foreground">{result.preview ? "First verified scheduled instructional day" : "Site-local date"}: {result.date} {result.preview ? "(future plan, not verified attendance)" : "(today)"}</p>
      {result.programName&&<p className="mt-1 text-xs">Program: {result.programName} · Section: {result.sectionTitle??"Not assigned"}</p>}
      <p role="status" className="mt-2">{result.message}</p>
      {result.preview&&<p className="mt-2 text-xs">Student placement and scheduling are verified for this date. Planned staffing is a separate review; no future physical presence, attendance, custody or school opening is being attested. Recheck after timetable or staffing changes.</p>}
      <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded border p-2"><dt className="text-xs">Expected onsite</dt>
          <dd className="font-semibold">{result.studentExpected?"Yes":"Not confirmed"}</dd></div>
        <div className="rounded border p-2"><dt className="text-xs">Reviewed staffing plan</dt>
          <dd className="font-semibold">{result.supervisionPlanned?"Ready":"Not confirmed"}</dd></div>
        <div className="rounded border p-2"><dt className="text-xs">Observed attendance</dt>
          <dd className="font-semibold">{result.preview?"Not yet observable":result.attendanceRecorded?"Recorded":"Not recorded"}</dd></div>
      </dl>
      {result.outstandingGaps.length>0&&<p className="mt-2 text-xs">
        Blockers: {result.outstandingGaps.map(gap=>gap.replaceAll("_"," ")).join("; ")}
      </p>}
      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        <Link to="/staff/attendance" search={{programId}}
          className="font-semibold underline">Open the Program's official attendance roster →</Link>
        <Link to="/site/day" className="font-semibold underline">
          Site director: Prepare and operate the onsite school day →
        </Link>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        This preview is not opening authorization, proof that a supervisor arrived,
        a child's attendance mark or an authorized custody release.
      </p>
    </>}
  </section>;
}

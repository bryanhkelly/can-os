import {useEffect,useState} from "react";
import {
  listPublicSchoolDayReviews,approveSchoolDayPublicSummary,
} from "@/modules/academic-time/public-school-day.functions";

type Schedule=Awaited<ReturnType<typeof listPublicSchoolDayReviews>>[number];
const weekday=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
export function PublicSchoolDayReviewPanel({siteId,programId}:{
  siteId:string;programId:string;
}) {
  const [schedules,setSchedules]=useState<Schedule[]>([]);
  const [loaded,setLoaded]=useState(false);
  const [pending,setPending]=useState("");
  const [message,setMessage]=useState("");
  useEffect(()=>{
    let live=true;
    listPublicSchoolDayReviews({data:{siteId,programId}}).then(value=>{
      if(!live)return;
      setSchedules(value);setLoaded(true);
    }).catch(()=>{if(live){setMessage("Unable to load the reviewed bell schedule.");setLoaded(true)}});
    return ()=>{live=false};
  },[siteId,programId]);
  async function approve(schedule:Schedule){
    setPending(schedule.id);setMessage("");
    try{
      const result=await approveSchoolDayPublicSummary({data:{
        siteId,programId,scheduleTemplateId:schedule.id,
        expectedRevision:schedule.revision,reviewed:true,
      }});
      setSchedules(items=>items.map(item=>item.id===schedule.id
        ? {...item,revision:result.revision,currentApproval:true}:item));
      setMessage("Institutional timetable summary reviewed. School opening and public Site publication remain independent.");
    }catch{setMessage("Approval could not be saved. Refresh to review current calendar periods.")}
    finally{setPending("")}
  }
  return <section aria-label="Public school day review" className="rounded-xl border bg-card p-5">
    <h2 className="font-serif text-xl">School-day timetable for families</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      Review current, approved school-year periods. This does not certify opening,
      staff coverage or legal school-day requirements. Sunday and Saturday are
      available whenever the authoritative schedule includes them.
    </p>
    {!loaded?<p role="status" className="mt-2 text-sm">Loading schedules…</p>:<>
      {schedules.length===0&&<p className="mt-2 text-sm">No active Program schedule is ready for review.</p>}
      <div className="mt-4 space-y-3">
        {schedules.map(schedule=><div key={schedule.id} className="rounded-lg border p-3 text-sm">
          <h3 className="font-semibold">{schedule.name}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {schedule.currentApproval?"Reviewed current schedule":"Not currently approved for public presentation"}
          </p>
          <div className="mt-2 grid gap-1">
            {schedule.periods.map((period,index)=><p key={index} className="text-xs">
              {weekday[period.dayOfWeek]??"Invalid day"} · {period.startsAtLocal}–{period.endsAtLocal}
              {" "}· {period.type}
            </p>)}
          </div>
          <button type="button" disabled={Boolean(pending)||!schedule.active||!schedule.periods.length}
            onClick={()=>void approve(schedule)}
            className="mt-3 rounded-lg border px-3 py-2 text-xs font-semibold">
            {pending===schedule.id?"Saving…":"Review and approve this timetable"}
          </button>
        </div>)}
      </div>
      {message&&<p className="mt-2 text-sm" role="status">{message}</p>}
    </>}
  </section>;
}

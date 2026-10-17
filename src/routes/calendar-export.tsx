import {createFileRoute} from "@tanstack/react-router";
import {getAssignments} from "@/modules/student-experience/assignments.functions";
import {renderICS} from "@/domain/calendar-ics";
import {safeLoader} from "@/lib/safe-loader";
import {LoaderFailure} from "@/lib/loader-failure";
const loadAssignments=()=>getAssignments();
export const Route=createFileRoute("/calendar-export")({loader:safeLoader(loadAssignments,{authMessage:"Sign in with an authorized student account to export your calendar."}),component:CalendarExport});
function CalendarExport(){
 const outcome=Route.useLoaderData();
 if(!outcome.ok)return <LoaderFailure eyebrow="CAN OS · Synthetic calendar" title="Calendar export" outcome={outcome}/>;
 const data:Awaited<ReturnType<typeof getAssignments>>=outcome.data;
 const exportCalendar=()=>{
  const items=data.assignments.filter(x=>x.dueAt&&x.metadata.synthetic).map(x=>({id:x.assessmentId,title:x.title,description:x.course,startsAt:x.dueAt!,endsAt:new Date(new Date(x.dueAt!).getTime()+30*60*1000).toISOString()}));
  const blob=new Blob([renderICS(items,"CAN OS synthetic assignments")],{type:"text/calendar;charset=utf-8"});
  const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download="can-os-synthetic-assignments.ics";link.click();URL.revokeObjectURL(url);
 };
 return <main className="mx-auto max-w-3xl px-5 py-10"><p className="text-xs uppercase tracking-widest text-muted-foreground">CAN OS · Synthetic calendar</p><h1 className="mt-2 font-serif text-4xl">Calendar export</h1><p className="mt-4 text-sm text-muted-foreground">Export synthetic assignment deadlines as an ICS file. This is a one-time import, not an automatically refreshing calendar subscription. Live subscription requires a scoped, revocable feed token.</p><button type="button" onClick={exportCalendar} className="mt-6 rounded-xl bg-foreground px-5 py-3 text-sm font-semibold text-background">Export synthetic deadlines (.ics)</button></main>;
}

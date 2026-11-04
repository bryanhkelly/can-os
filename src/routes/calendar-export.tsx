import { WorkspaceShell } from "@/components/workspace";
import {createFileRoute} from "@tanstack/react-router";
import {getAssignments} from "@/modules/student-experience/assignments.functions";
import {renderICS} from "@/domain/calendar-ics";
import {safeLoader} from "@/lib/safe-loader";
import {LoaderFailure} from "@/lib/loader-failure";
import {downloadBlob} from "@/lib/download";
const loadAssignments=()=>getAssignments();
export const Route=createFileRoute("/calendar-export")({loader:safeLoader(loadAssignments,{authMessage:"Sign in with an authorized student account to export your calendar."}),component:CalendarExport});
function CalendarExport(){
 const outcome=Route.useLoaderData();
 if(!outcome.ok)return <LoaderFailure eyebrow="Calendar" title="Calendar export" outcome={outcome}/>;
 const data:Awaited<ReturnType<typeof getAssignments>>=outcome.data;
 const exportCalendar=()=>{
  const items=data.assignments.filter(x=>x.dueAt).map(x=>({id:x.assessmentId,title:x.title,description:x.course,startsAt:x.dueAt!,endsAt:new Date(new Date(x.dueAt!).getTime()+30*60*1000).toISOString()}));
  const blob=new Blob([renderICS(items,"CAN OS assignment deadlines")],{type:"text/calendar;charset=utf-8"});
  downloadBlob(blob,"can-os-assignments.ics");
 };
 return <WorkspaceShell width="reading" eyebrow="Calendar" title="Calendar export" subtitle="Export your authorized assignment deadlines as an ICS file. This is a one-time import, not an automatically refreshing calendar subscription."><button type="button" onClick={exportCalendar} className="mt-6 rounded-xl bg-foreground px-5 py-3 text-sm font-semibold text-background">Export deadlines (.ics)</button></WorkspaceShell>;
}

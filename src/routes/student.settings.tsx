import {createFileRoute} from "@tanstack/react-router";
import {useState} from "react";
import {getSyntheticStudentPreferences,saveSyntheticStudentPreferences} from "@/modules/student-experience/student-preferences.functions";
import type {StudentDisplayPreferences} from "@/domain/student-display-preferences";
import {safeLoader} from "@/lib/safe-loader";
import {LoaderFailure} from "@/lib/loader-failure";
const loadStudentPreferences=()=>getSyntheticStudentPreferences();
export const Route=createFileRoute("/student/settings")({loader:safeLoader(loadStudentPreferences,{authMessage:"Sign in with an authorized student account to view display settings."}),component:StudentSettings});
function StudentSettings(){
 const outcome=Route.useLoaderData();
 if(!outcome.ok)return <LoaderFailure eyebrow="CAN OS · Synthetic student" title="Display settings" outcome={outcome}/>;
 return <StudentSettingsView initial={outcome.data}/>;
}
function StudentSettingsView({initial}:{initial:Awaited<ReturnType<typeof loadStudentPreferences>>}){
 const [value,setValue]=useState<StudentDisplayPreferences>(initial);
 const [message,setMessage]=useState("");
 const [busy,setBusy]=useState(false);
 const patch=(change:Partial<StudentDisplayPreferences>)=>setValue(previous=>({...previous,...change}));
 async function save(){
  setBusy(true);setMessage("");
  try {await saveSyntheticStudentPreferences({data:value});setMessage("Preferences saved.");}
  catch {setMessage("Saving isn't available on the production demonstration. Preferences are only persisted in private synthetic development.");}
  finally {setBusy(false);}
 }
 return <main className="mx-auto max-w-3xl px-5 py-10">
  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">CAN OS · Synthetic student</p>
  <h1 className="mt-2 font-serif text-4xl">Display settings</h1>
  <p className="mt-3 text-sm text-muted-foreground">Personalize the student experience. Changes can be persisted to Neon only in a private development environment where synthetic writes are explicitly enabled.</p>
  <div className="mt-7 space-y-5 rounded-xl border bg-card p-6">
   <label className="block text-sm font-medium">Layout density<select className="mt-2 block w-full rounded-lg border bg-background p-2" value={value.density} onChange={e=>patch({density:e.target.value as StudentDisplayPreferences["density"]})}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
   <label className="block text-sm font-medium">Default student section<select className="mt-2 block w-full rounded-lg border bg-background p-2" value={value.defaultStudentTab} onChange={e=>patch({defaultStudentTab:e.target.value as StudentDisplayPreferences["defaultStudentTab"]})}><option value="today">Today</option><option value="courses">Courses</option><option value="assignments">Assignments</option><option value="support">Support</option></select></label>
   <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={value.reduceMotion} onChange={e=>patch({reduceMotion:e.target.checked})}/>Reduce motion</label>
   <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={value.showCompletedAssignments} onChange={e=>patch({showCompletedAssignments:e.target.checked})}/>Show completed assignments</label>
   <button type="button" disabled={busy} onClick={save} className="rounded-xl bg-foreground px-5 py-3 text-sm font-semibold text-background">{busy?"Saving…":"Save preferences"}</button>
   {message&&<p role="status" className="text-sm text-muted-foreground">{message}</p>}
  </div>
 </main>;
}

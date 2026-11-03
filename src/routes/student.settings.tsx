import {createFileRoute,useRouter} from "@tanstack/react-router";
import {useQueryClient} from "@tanstack/react-query";
import {useState} from "react";
import {getSyntheticStudentPreferences,saveSyntheticStudentPreferences} from "@/modules/student-experience/student-preferences.functions";
import type {StudentDisplayPreferences} from "@/domain/student-display-preferences";
import {safeLoader} from "@/lib/safe-loader";
import {LoaderFailure} from "@/lib/loader-failure";
import {useMutationFeedback} from "@/lib/mutation-feedback";
import {MutationFeedback} from "@/components/workspace/mutation-feedback";
import {workspaceSessionQueryOptions} from "@/components/shell/WorkspaceSession";
const loadStudentPreferences=()=>getSyntheticStudentPreferences();
export const Route=createFileRoute("/student/settings")({loader:safeLoader(loadStudentPreferences,{authMessage:"Sign in with an authorized student account to view display settings."}),component:StudentSettings});
function StudentSettings(){
 const outcome=Route.useLoaderData();
 if(!outcome.ok)return <LoaderFailure eyebrow="CAN OS · Student" title="Display settings" outcome={outcome}/>;
 return <StudentSettingsView initial={outcome.data}/>;
}
function StudentSettingsView({initial}:{initial:Awaited<ReturnType<typeof loadStudentPreferences>>}){
 const [value,setValue]=useState<StudentDisplayPreferences>(initial);
 const queryClient=useQueryClient();
 const router=useRouter();
 const mutation=useMutationFeedback(async()=>{
  const refreshed=await queryClient.fetchQuery({...workspaceSessionQueryOptions(),staleTime:0});
  if(refreshed.error||!refreshed.session?.authenticated)throw new Error("Unable to refresh your student display preferences.");
  await router.invalidate();
 });
 const busy=mutation.pending||mutation.refreshFailed;
 const patch=(change:Partial<StudentDisplayPreferences>)=>setValue(previous=>({...previous,...change}));
 async function save(){
  await mutation.run(()=>saveSyntheticStudentPreferences({data:value}),{
   successMessage:"Preferences saved.",
   commandErrorMessage:"Unable to save preferences. Please try again.",
  });
 }
 return <main className="mx-auto max-w-3xl px-5 py-10">
  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">CAN OS · Student</p>
  <h1 className="mt-2 font-serif text-4xl">Display settings</h1>
  <p className="mt-3 text-sm text-muted-foreground">Personalize your student workspace. Preferences belong to your student identity and apply after saving. The default section opens when you sign in or choose CAN OS home; Today and direct links still open their named page.</p>
  <fieldset disabled={busy} className="mt-7 space-y-5 rounded-xl border bg-card p-6">
   <legend className="sr-only">Student display preferences</legend>
   <label className="block text-sm font-medium">Layout density<select className="mt-2 block w-full rounded-lg border bg-background p-2" value={value.density} onChange={e=>patch({density:e.target.value as StudentDisplayPreferences["density"]})}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
   <label className="block text-sm font-medium">Default student section<select className="mt-2 block w-full rounded-lg border bg-background p-2" value={value.defaultStudentTab} onChange={e=>patch({defaultStudentTab:e.target.value as StudentDisplayPreferences["defaultStudentTab"]})}><option value="today">Today</option><option value="courses">Courses</option><option value="assignments">Assignments</option><option value="support">Support</option></select></label>
   <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={value.reduceMotion} onChange={e=>patch({reduceMotion:e.target.checked})}/>Reduce motion</label>
   <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={value.showCompletedAssignments} onChange={e=>patch({showCompletedAssignments:e.target.checked})}/>Show completed assignments</label>
   <button type="button" disabled={busy} onClick={save} className="rounded-xl bg-foreground px-5 py-3 text-sm font-semibold text-background">{busy?"Saving…":"Save preferences"}</button>
  </fieldset>
  <MutationFeedback state={mutation} className="mt-5" pendingMessage="Saving preferences..."/>
 </main>;
}

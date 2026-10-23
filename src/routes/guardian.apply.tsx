import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { WorkspaceShell } from "@/components/workspace";
import {
  getGuardianFamilyApplicationWorkspace,
  startGuardianFamilyApplication,
} from "@/modules/enrollment/guardian-family-applications.functions";

export const Route = createFileRoute("/guardian/apply")({
  validateSearch:(search:Record<string,unknown>):{programId?:string}=>({
    programId:typeof search.programId==="string" ? search.programId : undefined,
  }),
  loader: safeLoader(getGuardianFamilyApplicationWorkspace,{
    authMessage:"Sign in with your verified family account to apply to a school.",
  }),
  component:GuardianApplyPage,
});

function GuardianApplyPage(){
  const result=Route.useLoaderData();
  if(!result.ok)return <LoaderFailure eyebrow="CAN OS · Family" title="Apply to school" outcome={result}/>;
  return <GuardianApplyWorkspace data={result.data}/>;
}

function GuardianApplyWorkspace({data}:{
  data:Awaited<ReturnType<typeof getGuardianFamilyApplicationWorkspace>>;
}){
  const router=useRouter();
  const requested=Route.useSearch().programId;
  const selectedProgram=data.programs.find(item=>item.id===requested);
  const [programId,setProgramId]=useState(selectedProgram?.id??data.programs[0]?.id??"");
  const [householdId,setHouseholdId]=useState(data.households[0]?.id??"");
  const [firstName,setFirstName]=useState("");
  const [lastName,setLastName]=useState("");
  const [grade,setGrade]=useState("");
  const [requestId,setRequestId]=useState(()=>crypto.randomUUID());
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");

  async function submit(event:FormEvent){
    event.preventDefault();setBusy(true);setError("");setNotice("");
    try{
      const result=await startGuardianFamilyApplication({data:{
        requestId,programId,studentFirstName:firstName,
        studentLastName:lastName,gradeLevel:grade,
        ...(householdId?{householdId}:{}),
      }});
      setNotice(`Application received (${result.applicationId}). The school must independently verify your guardian relationship before forms, offers and academic access are enabled.`);
      setRequestId(crypto.randomUUID());
      setFirstName("");setLastName("");setGrade("");
      await router.invalidate();
    }catch(e){setError(e instanceof Error?e.message:"Unable to submit application");}
    finally{setBusy(false);}
  }

  return <WorkspaceShell eyebrow="CAN OS · Family" title="Apply to a school"
    subtitle="Start a real academic application for an eligible CAN school. An application does not automatically approve enrollment or grant access to a child's records."
    actions={<Link to="/guardian" className="rounded border px-3 py-2 text-sm">Family home →</Link>}>
    {notice&&<p role="status" className="mt-5 rounded-lg border p-4 text-sm">{notice}</p>}
    {error&&<p role="alert" className="mt-5 rounded-lg border border-red-500 p-4 text-sm">{error}</p>}
    <section className="mt-7 rounded-xl border bg-card p-5">
      <h2 className="text-xl font-semibold">Your applications</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Existing applications remain here when you return. Do not create a duplicate for the same student;
        admissions will contact you about independent identity verification and next steps.
      </p>
      {data.applications.length?<div className="mt-4 space-y-3">
        {data.applications.map(app=><article className="rounded-lg border p-3" key={app.applicationId}>
          <p className="font-semibold">{app.studentFirstName} {app.studentLastName}</p>
          <p className="text-sm">{app.programName} · {app.stage.replaceAll("_"," ")}</p>
          <p className="mt-1 text-xs text-muted-foreground">Last updated {new Date(app.updatedAt).toLocaleDateString()}</p>
        </article>)}
      </div>:<p className="mt-3 text-sm">No applications submitted from this family account yet.</p>}
      <Link to="/guardian/admission-offers" className="mt-4 inline-block text-sm underline">
        Verified enrollment checklists and offers →
      </Link>
    </section>
    <section className="mt-7 rounded-xl border bg-card p-5">
      <h2 className="text-xl font-semibold">New student application</h2>
      {data.programs.length===0?<p role="status" className="mt-3 text-sm">
        No eligible school is currently available to this verified family account.
        Contact the school's admissions team about your invitation and application opening.
      </p>:<form onSubmit={e=>void submit(e)} className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">School and Program
          <select required value={programId} onChange={e=>setProgramId(e.target.value)}
            className="mt-1 block w-full rounded border bg-background p-2">
            {data.programs.map(program=><option key={program.id} value={program.id}>{program.name}</option>)}
          </select>
        </label>
        <label className="text-sm sm:col-span-2">Family household
          <select value={householdId} onChange={e=>setHouseholdId(e.target.value)}
            className="mt-1 block w-full rounded border bg-background p-2">
            <option value="">Create a new family household</option>
            {data.households.map(family=><option key={family.id} value={family.id}>{family.name}</option>)}
          </select>
          <span className="mt-1 block text-xs text-muted-foreground">
            Reuse your existing household for siblings. The server verifies that this signed-in
            guardian belongs to the selected household.
          </span>
        </label>
        <label className="text-sm">Student legal first name
          <input required maxLength={100} value={firstName} onChange={e=>setFirstName(e.target.value)}
            className="mt-1 block w-full rounded border bg-background p-2"/>
        </label>
        <label className="text-sm">Student legal last name
          <input required maxLength={100} value={lastName} onChange={e=>setLastName(e.target.value)}
            className="mt-1 block w-full rounded border bg-background p-2"/>
        </label>
        <label className="text-sm sm:col-span-2">Entering grade level
          <input required maxLength={10} value={grade} onChange={e=>setGrade(e.target.value)}
            placeholder="e.g. 9" className="mt-1 block w-full rounded border bg-background p-2"/>
        </label>
        <p className="sm:col-span-2 text-xs text-muted-foreground">
          Submission creates one canonical Application and enrollment Journey with pending
          guardian verification. It does not accept an offer, establish legal guardianship
          or place a student into classes.
        </p>
        <button type="submit" disabled={busy||!programId} className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">
          {busy?"Submitting…":"Submit application"}
        </button>
      </form>}
    </section>
  </WorkspaceShell>;
}

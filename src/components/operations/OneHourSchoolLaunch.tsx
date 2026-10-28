import { Link } from "@tanstack/react-router";
import { StatusBadge } from "@/components/workspace";
import type { listLaunches } from "@/modules/programs/launch.functions";

type Launch = Awaited<ReturnType<typeof listLaunches>>["launches"][number];

const steps = [
  { title:"School Basics", description:"Confirm the school and church partnership.", path:"/operations/launch", key:"basics" },
  { title:"School Model", description:"Choose a starting model; customize the actual program settings.", path:"/operations/launch", key:"model" },
  { title:"Academic Program", description:"Set up the school year, classes, and approved instruction.", path:"/operations/launch/$programId", key:"academics" },
  { title:"School Day", description:"Plan the calendar, rooms, and supervised daily schedule.", path:"/calendar", key:"day" },
  { title:"Team", description:"Assign people and complete independent staff verification.", path:"/operations/launch/$programId", key:"team" },
  { title:"Family Outreach", description:"Prepare family communications and invitations.", path:"/messages", key:"outreach" },
  { title:"Public School Page", description:"Preview and publish your church's school page.", path:"/sites/$siteId/publish", key:"website" },
  { title:"Applications", description:"Prepare the family's application and admissions journey.", path:"/admissions/intake", key:"applications" },
  { title:"Readiness Review", description:"Resolve the actual launch requirements and opening decisions.", path:"/operations/launch", key:"readiness" },
  { title:"Launch Summary", description:"Review what's configured and what still blocks opening.", path:"/operations/launch", key:"summary" },
] as const;

export function OneHourSchoolLaunch({ launches, selectedProgramId }:{ launches:Launch[]; selectedProgramId?:string }) {
  const launch=launches.find(item=>item.id===selectedProgramId)??launches[0];
  if(!launch)return <section className="mt-8 rounded-2xl border bg-card p-6" aria-label="Launch your school">
    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">School launch</p>
    <h2 className="mt-2 font-serif text-3xl">Let's open your school</h2>
    <p className="mt-3 max-w-2xl text-sm text-muted-foreground">Start with a school name, church, and location. CAN will create the existing school launch record and guide you through the remaining setup. Nothing is authorized to open merely by starting.</p>
    <a href="#new-school-launch" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">Launch a school</a>
  </section>;
  const pending=launch.requirements.filter(requirement=>requirement.status!=="complete");
  const blocking=pending.filter(requirement=>requirement.blocking);
  const isActive=launch.status==="active";
  const urlFor=(key:string,path:string)=>{
    if(key==="website"&&!launch.siteId)return "/operations/launch";
    if(path==="/operations/launch/$programId")return `/operations/launch/${encodeURIComponent(launch.id)}`;
    if(path==="/sites/$siteId/publish")return `/sites/${encodeURIComponent(launch.siteId!)}/publish`;
    if(path==="/operations/launch")return `/operations/launch?programId=${encodeURIComponent(launch.id)}`;
    if(path==="/admissions/intake")return `/admissions/intake?programId=${encodeURIComponent(launch.id)}`;
    return path;
  };
  return <section className="mt-8 rounded-2xl border bg-card p-5 sm:p-7" aria-label="Guided school launch">
    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Guided school launch</p>
    <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="font-serif text-3xl">Let's open your school</h2><p className="mt-2 text-lg font-semibold">{launch.name}</p></div>
      <StatusBadge tone={isActive?"success":"attention"}>{isActive?"Active program":"Configured does not mean authorized to open"}</StatusBadge>
    </div>
    <p className="mt-3 text-sm text-muted-foreground">{blocking.length} recorded blocking requirements · {pending.length} outstanding requirements. These are canonical launch records, not client-completed checkboxes.</p>
    <div className="mt-5 flex flex-wrap gap-3">
      <Link to="/operations/launch/$programId" params={{programId:launch.id}} className="inline-flex min-h-11 items-center rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">Continue setup</Link>
      {launch.siteId&&<Link to="/sites/$siteId/publish" params={{siteId:launch.siteId}} className="inline-flex min-h-11 items-center rounded-xl border px-5 py-2 text-sm font-semibold">Preview school</Link>}
    </div>
    <ol className="mt-7 grid gap-3 sm:grid-cols-2">
      {steps.map((step,index)=><li key={step.key} className="rounded-xl border p-4">
        <div className="flex items-start justify-between gap-2"><h3 className="font-semibold">{index+1}. {step.title}</h3><StatusBadge tone="neutral">Review setup</StatusBadge></div>
        <p className="mt-2 text-sm text-muted-foreground">{step.description}</p>
        <a href={urlFor(step.key,step.path)} className="mt-3 inline-block text-sm font-semibold underline">Open this step</a>
      </li>)}
    </ol>
    <div className="mt-7 rounded-xl border border-warning/40 p-5">
      <h3 className="font-semibold">Before students arrive</h3>
      {pending.length?<ul className="mt-3 space-y-2">{pending.map(requirement=><li key={requirement.id} className="flex items-start gap-2 text-sm"><span aria-hidden="true">{requirement.blocking?"●":"○"}</span><span>{requirement.title} · {requirement.blocking?"Blocking opening":requirement.status.replaceAll("_"," ")}</span></li>)}</ul>:<p className="mt-2 text-sm">No outstanding requirements in this launch checklist. Verify the independent opening decision before welcoming students.</p>}
      <Link to="/operations/launch" search={{siteId:launch.siteId??undefined,programId:launch.id}} className="mt-4 inline-block text-sm font-semibold underline">Review opening requirements</Link>
    </div>
  </section>;
}

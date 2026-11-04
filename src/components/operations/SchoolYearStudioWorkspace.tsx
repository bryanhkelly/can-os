import { Link, useNavigate } from "@tanstack/react-router";
import type { getSchoolYearStudio } from "@/modules/academic-time/school-year-studio.functions";
import { SchoolYearCard } from "@/components/operations/SchoolYearCard";
import { CreateAction, EmptyState, WorkspaceShell, secondaryActionClassName } from "@/components/workspace";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";

type Snapshot=Awaited<ReturnType<typeof getSchoolYearStudio>>;
export function SchoolYearStudioWorkspace({data,selection}:{data:Snapshot;selection:{siteId?:string;programId?:string}}){
 const navigate=useNavigate();
 const siteId=selection.siteId??data.programs.find(p=>p.id===selection.programId)?.siteId??(data.sites.length===1?data.sites[0]!.id:"");
 const years=data.years.filter(y=>!siteId||y.siteId===siteId);
 const scope={siteId:siteId||undefined,programId:selection.programId};
 const siteNames=new Map(data.sites.map(site=>[site.id,site.name]));
 return <WorkspaceShell eyebrow="Academic operations" title="School years"
  subtitle="Site-owned school years, terms, grading periods and academic calendars. Activation requires readiness checks; this page does not renew a student's enrollment."
  actions={<div className="flex flex-wrap gap-2">
   <CreateAction><Link to="/operations/school-years/new" search={scope}>Create school year</Link></CreateAction>
   <Link to="/home" search={{siteId:undefined,programId:undefined}} className={secondaryActionClassName}>Operations</Link>
  </div>}>
  {data.sites.length>1&&<Field label="Site" className="mt-6 max-w-sm">
   <Select value={siteId} onChange={e=>void navigate({to:"/operations/school-years",search:{siteId:e.target.value||undefined,programId:undefined}})}>
    <option value="">All sites</option>
    {data.sites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
   </Select>
  </Field>}
  <section aria-labelledby="saved-school-years" className="mt-8">
   <h2 id="saved-school-years" className="text-lg font-semibold">Saved school years <span className="font-normal text-muted-foreground">({years.length})</span></h2>
   <div className="mt-4 space-y-4">{years.map(y=><SchoolYearCard key={y.id} year={y} scope={scope} siteName={data.sites.length>1?siteNames.get(y.siteId):undefined}/>)}
   {!years.length&&<EmptyState title="No school years yet" description="No school years have been configured for the selected site. Create one to add its terms, grading periods and calendar."/>}</div>
  </section>
 </WorkspaceShell>;
}
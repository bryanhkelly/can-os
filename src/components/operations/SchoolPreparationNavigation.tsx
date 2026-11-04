import {Link} from "@tanstack/react-router";
type School={id:string;name:string;siteId:string|null;siteName:string;status:string};
export function SchoolPreparationNavigation({schools,selected,onSelect}:{
 schools:School[];selected:School|null;onSelect:(school:School)=>void;
}){
 if(!schools.length)return null;
 return <section id="school-preparation-selection" aria-label="Your school preparation" className="mt-4 scroll-mt-6 rounded-xl border bg-card p-5">
  <label className="block text-sm font-semibold">School you are preparing
   <select value={selected?.id??""} onChange={event=>{const school=schools.find(item=>item.id===event.target.value);if(school)onSelect(school);}}
    className="mt-2 w-full rounded border bg-background p-3 font-normal">
    <option value="">Choose your school</option>{schools.map(school=><option key={school.id} value={school.id}>{school.name} · {school.siteName}</option>)}
   </select>
  </label>
  {selected?.status==="active"&&<div className="mt-3 text-sm">
   <p className="font-semibold">{selected.name} · operating workspace available</p>
   <p className="mt-1">This Program is active. Continue its daily operational work in Operations. Website edits, family invitations and school-year planning remain available here. Active Program status alone does not certify today's opening, staffing or supervision.</p>
   <div className="mt-3 flex flex-wrap items-center gap-3">
    <Link to="/home" search={{siteId:selected.siteId??undefined,programId:selected.id}} className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground">Go to school operations →</Link>
    <Link to="/operations/school-years" search={{siteId:selected.siteId??undefined,programId:selected.id}} className="inline-flex min-h-11 items-center text-sm font-semibold underline">Review saved academic year</Link>
   </div>
  </div>}
 </section>;
}

import {Link} from "@tanstack/react-router";
type School={id:string;name:string;siteId:string;siteName:string;status:string};
export function SchoolPreparationNavigation({schools,selected,onSelect}:{
 schools:School[];selected:School|null;onSelect:(school:School)=>void;
}){
 if(!schools.length)return null;
 return <section aria-label="Your school preparation" className="mt-4 rounded-xl border bg-card p-5">
  <label className="block text-sm font-semibold">School you are preparing
   <select value={selected?.id??""} onChange={event=>{const school=schools.find(item=>item.id===event.target.value);if(school)onSelect(school);}}
    className="mt-2 w-full rounded border bg-background p-3 font-normal">
    <option value="">Choose your school</option>{schools.map(school=><option key={school.id} value={school.id}>{school.name} · {school.siteName}</option>)}
   </select>
  </label>
  {selected?.status==="active"&&<div className="mt-3 text-sm">
   <p className="font-semibold">Continue preparing {selected.name}</p>
   <p className="mt-1">Your Program is active. Website preparation, family invitations and admissions remain available below. Review current opening authority in the operating workspace.</p>
   <Link to="/sites/$siteId" params={{siteId:selected.siteId}} className="mt-3 inline-block rounded border px-4 py-2 font-semibold">Open Site Today →</Link>
   <Link to="/operations/school-years" search={{siteId:selected.siteId,programId:selected.id}} className="ml-3 inline-block underline">Review saved academic year</Link>
  </div>}
 </section>;
}

/** A small, role-scoped chronological view derived from *already authorized*
 * academic, attendance and owned-work records. This is not a new ledger and
 * never includes medical, counselor or private case notes.
 */
export function studentAcademicTimeline(input:{
  sections:readonly {sectionId:string;title:string}[];
  grades:readonly {sectionId:string;finalizedAt:Date|null;letterGrade:string|null}[];
  attendance:readonly {expectedAt:Date;status:string;sectionTitle:string|null}[];
  actions:readonly {id:string;type:string;title:string;createdAt:Date;status:string}[];
},limit=25){
  const names=new Map(input.sections.map(s=>[s.sectionId,s.title]));
  const items=[
    ...input.grades.filter(g=>g.finalizedAt).map(g=>({
      id:`grade:${g.sectionId}:${g.finalizedAt!.toISOString()}`,
      at:g.finalizedAt!.toISOString(),kind:"grade" as const,
      title:`Finalized grade · ${names.get(g.sectionId)??"Class"}`,
      detail:g.letterGrade?`Finalized: ${g.letterGrade}`:"Finalized grade recorded",
      href:null as string|null,
    })),
    ...input.attendance.map((a,i)=>({
      id:`attendance:${a.expectedAt.toISOString()}:${i}`,
      at:a.expectedAt.toISOString(),kind:"attendance" as const,
      title:`${a.status==="absent"?"Absence":"Tardy"} recorded`,
      detail:a.sectionTitle??"School attendance",
      href:null as string|null,
    })),
    ...input.actions.filter(a=>
      a.type==="academic_intervention"||a.type==="guardian_grade_follow_up")
      .map(a=>({
        id:`action:${a.id}`,at:a.createdAt.toISOString(),kind:"action" as const,
        title:a.type==="guardian_grade_follow_up"?"Guardian academic question":"Academic follow-up",
        detail:`Status: ${a.status.replaceAll("_"," ")}`,
        href:`/actions/${encodeURIComponent(a.id)}` as string|null,
      })),
  ];
  return items.sort((a,b)=>b.at.localeCompare(a.at)||a.id.localeCompare(b.id))
    .slice(0,Math.max(0,Math.min(50,limit)));
}

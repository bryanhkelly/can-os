export type MissingWork={assessmentId:string;title:string;course:string;dueAt:string|null;status:string|null;submittedAt:string|null};
export function isMissingWork(a:MissingWork,now:Date):boolean{
 if(!a.dueAt||new Date(a.dueAt).getTime()>=now.getTime())return false;
 return a.status===null||a.status==="assigned";
}
export function missingWorkQueue<T extends MissingWork>(items:T[],now:Date):T[]{
 return items.filter(x=>isMissingWork(x,now)).sort((a,b)=>(a.dueAt??"").localeCompare(b.dueAt??""));
}

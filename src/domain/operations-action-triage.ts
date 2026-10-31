export type TriageAction = {
  id:string;
  priority:"critical"|"high"|"normal";
  status:string;
  dueAt:string|null;
  ownerPersonId:string|null;
  createdAt:string;
};

/** Stable presentation priority. No synthetic action status is persisted. */
export function prioritizeSchoolActions<T extends TriageAction>(items:readonly T[], now=Date.now()):T[] {
  const weight=(x:T)=>{
    const due=x.dueAt?new Date(x.dueAt).getTime():Infinity;
    const late=due<now;
    return [x.priority==="critical"?0:x.priority==="high"?1:2,
      late?0:1, x.ownerPersonId?1:0, due, -new Date(x.createdAt).getTime()] as const;
  };
  return [...items].sort((a,b)=>{
    const aa=weight(a),bb=weight(b);
    for(let i=0;i<aa.length;i++){const diff=aa[i]!-bb[i]!;if(diff)return diff;}
    return a.id.localeCompare(b.id);
  });
}
export function schoolActionBacklog<T extends TriageAction>(items:readonly T[],now=Date.now()){
  return {
    overdue:items.filter(x=>x.dueAt&&new Date(x.dueAt).getTime()<now).length,
    unassigned:items.filter(x=>!x.ownerPersonId).length,
    waiting:items.filter(x=>x.status==="waiting").length,
  };
}

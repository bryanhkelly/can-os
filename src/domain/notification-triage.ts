export type Notice={id:string;title:string;status:string;resourceType:string|null;resourceId:string|null;createdAt:Date;body:string|null};
export type QueueItem={id:string;kind:"action"|"notification";title:string;detail:string;priority:"critical"|"high"|"normal"|"low";createdAt:string;href:string;needsResponse:boolean};
export function notificationRoute(type:string|null,id:string|null):string|null{
 if(!id)return null;
 if(type==="submission")return "/student/assignments";
 if(type==="action")return "/student/support?referral="+encodeURIComponent(id);
 return null;
}
export function dedupeQueue(items:QueueItem[]):QueueItem[]{
 const sorted=[...items].sort((a,b)=>Number(b.priority==="critical")-Number(a.priority==="critical")||Number(b.priority==="high")-Number(a.priority==="high")||b.createdAt.localeCompare(a.createdAt));
 return sorted.filter((x,i)=>sorted.findIndex(y=>y.kind===x.kind&&y.id===x.id)===i);
}
export function notificationSummary(items:QueueItem[]){
 return {total:items.length,urgent:items.filter(x=>x.priority==="critical"||x.priority==="high").length,needsResponse:items.filter(x=>x.needsResponse).length};
}

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
export type NotificationPreference={category:string;inApp:boolean;email:boolean;digest:"none"|"daily"|"weekly";quietHours?:{start:string;end:string}};
export function normalizePreferences(values:NotificationPreference[]):NotificationPreference[]{return values.filter(x=>x.category.trim().length>0).map(x=>({...x,inApp:x.inApp!==false,email:x.email===true,digest:x.email?x.digest:"none"}));}
export function classifyNotification(type:string):"academic"|"support"|"operations"|"general"{if(type.includes("submission")||type.includes("grade")||type.includes("assignment"))return "academic";if(type.includes("referral")||type.includes("support"))return "support";if(type.includes("approval")||type.includes("action"))return "operations";return "general";}
export function notificationSummary(items:QueueItem[]){
 return {total:items.length,urgent:items.filter(x=>x.priority==="critical"||x.priority==="high").length,needsResponse:items.filter(x=>x.needsResponse).length};
}

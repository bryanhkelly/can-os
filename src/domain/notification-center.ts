export type CenterNotice={id:string;title:string;status:string;date:string;href:string|null;body:string};
export function groupNotices(items:CenterNotice[]){
 const sorted=[...items].sort((a,b)=>b.date.localeCompare(a.date));
 return {unread:sorted.filter(n=>n.status==="unread"),earlier:sorted.filter(n=>n.status!=="unread"),unreadCount:sorted.filter(n=>n.status==="unread").length};
}
export function notificationCountLabel(count:number){return count>99?"99+":String(Math.max(0,count));}

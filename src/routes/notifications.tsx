import { useMutationFeedback } from "@/lib/mutation-feedback";
import {useRef,useState} from "react";
import {createFileRoute,Link,useRouter} from "@tanstack/react-router";
import {getNotifications,readNotification,readAllNotifications,setNotificationStatus} from "@/modules/communication/notification-center.functions";
import {groupNotices} from "@/domain/notification-center";
import {safeLoader} from "@/lib/safe-loader";
import {LoaderFailure} from "@/lib/loader-failure";
import {z} from "zod";
import {getDeliveryHistory} from "@/modules/communication/delivery-history.functions";
import {DeliveryHistory} from "@/components/communication/DeliveryHistory";
const loadNotifications=async(deliveryCursor?:string)=>{
 const [notices,history]=await Promise.all([getNotifications(),
  safeLoader(()=>getDeliveryHistory({data:{cursor:deliveryCursor}}))()]);
 return {notices,history};
};
export const Route=createFileRoute("/notifications")({
 validateSearch:(search:Record<string,unknown>):{notification?:string;deliveryCursor?:string}=>({
  notification:typeof search.notification==="string"?search.notification:undefined,
  deliveryCursor:z.string().uuid().optional().parse(search.deliveryCursor),
 }),
 loaderDeps:({search})=>({deliveryCursor:search.deliveryCursor}),
 loader:({deps})=>safeLoader(()=>loadNotifications(deps.deliveryCursor),{authMessage:"Sign in to view your notifications."})(),
 component:NotificationsPage});
function NotificationsPage(){
 const outcome=Route.useLoaderData();
 const {deliveryCursor}=Route.useSearch();
 if(!outcome.ok)return <LoaderFailure eyebrow="CAN OS · Notifications" title="Notification center" outcome={outcome}/>;
 return <NotificationsView key={deliveryCursor??"latest"} notices={outcome.data.notices} history={outcome.data.history}/>;
}
function NotificationsView({notices,history}:Awaited<ReturnType<typeof loadNotifications>>){
 const router=useRouter();
 const {notification,deliveryCursor}=Route.useSearch();
 const feedback=useMutationFeedback(()=>router.invalidate());
 const busy=feedback.pending||feedback.refreshFailed;
 const refreshingHistory=useRef(false);
 const [refreshing,setRefreshing]=useState(false);
 const [refreshedHistory,setRefreshedHistory]=useState<{source:typeof history;outcome:typeof history}|null>(null);
 const currentHistory=refreshedHistory&&refreshedHistory.source===history?refreshedHistory.outcome:history;
 const center=groupNotices(notification?notices.filter(item=>item.id===notification):notices);
 async function markRead(id:string){
  await feedback.run(()=>readNotification({data:{id}}),{successMessage:"Notification marked as read.",commandErrorMessage:"Unable to update notification."});
 }
 async function changeStatus(id:string,status:"unread"|"dismissed"){
  await feedback.run(()=>setNotificationStatus({data:{id,status}}),{successMessage:status==="unread"?"Notification marked unread.":"Notification dismissed.",commandErrorMessage:"Unable to update notification."});
 }
 async function markAllRead(){
  await feedback.run(()=>readAllNotifications(),{successMessage:"Notifications marked as read.",commandErrorMessage:"Unable to update notifications."});
 }
 async function refreshHistory(){
  if(refreshingHistory.current)return;
  refreshingHistory.current=true;setRefreshing(true);
  try{
   const outcome=await safeLoader(()=>getDeliveryHistory({data:{cursor:deliveryCursor}}))();
   setRefreshedHistory({source:history,outcome});
  }finally{refreshingHistory.current=false;setRefreshing(false);}
 }
 return <main className="mx-auto max-w-4xl px-5 py-10">
 <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">CAN OS · Notifications</p>
 <h1 className="mt-2 font-serif text-4xl">Notification center</h1>
 <p className="mt-3 text-sm text-muted-foreground">Updates stay linked to their related records. Changes to notification status persist in your account.</p>
 {notification&&<Link to="/notifications" className="mt-4 inline-block text-sm underline">View all notifications</Link>}
 {notification&&!notices.some(item=>item.id===notification)&&<p role="alert" className="mt-4 rounded-xl border p-4">This notification is unavailable in your current account.</p>}
 {feedback.notice&&<p role="status" className="mt-4 text-sm">{feedback.notice}</p>}
 {feedback.error&&<p role="alert" className="mt-4 rounded-xl border border-red-400 p-3 text-sm">{feedback.error}</p>}
 {feedback.refreshFailed&&<button type="button" disabled={feedback.pending} onClick={()=>void feedback.retryRefresh()} className="mt-3 rounded-lg border px-3 py-2 text-sm">Refresh saved notifications</button>}
 <div className="mt-6 flex items-center justify-between gap-4 rounded-xl border bg-card p-4"><span className="font-semibold">Unread notifications: {center.unreadCount}</span><button type="button" disabled={!center.unreadCount||busy} onClick={markAllRead} className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50">{feedback.pending?"Saving…":"Mark all as read"}</button></div>
 {([{label:"Needs attention",items:center.unread},{label:"Earlier updates",items:center.earlier}] as const).map(section=><section key={section.label} className="mt-8"><h2 className="font-serif text-2xl">{section.label}</h2>
 <div className="mt-4 space-y-3">{section.items.map(n=><article key={n.id} className="rounded-xl border bg-card p-5"><div className="flex flex-wrap items-center justify-between gap-3"><p className="font-semibold">{n.href?<Link to={n.href} href={n.href} className="hover:underline">{n.title}</Link>:n.title}</p><time className="text-xs text-muted-foreground">{new Date(n.date).toLocaleDateString()}</time></div><p className="mt-2 text-sm text-muted-foreground">{n.body}</p><div className="mt-3 flex flex-wrap items-center gap-4">{n.href?<Link to={n.href} href={n.href} className="text-xs font-semibold underline">Open related record →</Link>:<span className="text-xs text-muted-foreground">No supported deep link for this update.</span>}{n.status!=="unread"&&<button type="button" disabled={busy} className="rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50" onClick={()=>changeStatus(n.id,"unread")}>Mark unread</button>}{n.status!=="dismissed"&&<button type="button" disabled={busy} className="rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50" onClick={()=>changeStatus(n.id,"dismissed")}>Dismiss</button>}{n.status==="unread"&&<button type="button" disabled={busy} className="rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50" onClick={()=>markRead(n.id)}>{feedback.pending?"Saving…":"Mark as read"}</button>}</div></article>)}{!section.items.length&&<p className="rounded-xl border p-5 text-sm text-muted-foreground">Nothing here yet.</p>}</div></section>)}
 <DeliveryHistory history={currentHistory.ok?currentHistory.data:null} cursor={deliveryCursor} notification={notification} refreshing={refreshing} onRefresh={()=>void refreshHistory()}/>
 </main>;
}

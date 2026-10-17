import {useState} from "react";
import {createFileRoute,Link,useRouter} from "@tanstack/react-router";
import {getNotifications,readNotification,readAllNotifications,setNotificationStatus} from "@/modules/communication/notification-center.functions";
import {groupNotices} from "@/domain/notification-center";
import {safeLoader} from "@/lib/safe-loader";
import {LoaderFailure} from "@/lib/loader-failure";
const loadNotifications=()=>getNotifications();
export const Route=createFileRoute("/notifications")({loader:safeLoader(loadNotifications,{authMessage:"Sign in to view your notifications."}),component:NotificationsPage});
function NotificationsPage(){
 const outcome=Route.useLoaderData();
 if(!outcome.ok)return <LoaderFailure eyebrow="CAN OS · Notifications" title="Notification center" outcome={outcome}/>;
 return <NotificationsView notices={outcome.data}/>;
}
function NotificationsView({notices}:{notices:Awaited<ReturnType<typeof loadNotifications>>}){
 const router=useRouter();
 const [busy,setBusy]=useState<string|null>(null);
 const [error,setError]=useState("");
 const center=groupNotices(notices);
 async function markRead(id:string){
  setBusy(id);setError("");
  try{await readNotification({data:{id}});await router.invalidate();}
  catch(e){setError(e instanceof Error?e.message:"Unable to update notification");}
  finally{setBusy(null);}
 }
 async function changeStatus(id:string,status:"unread"|"dismissed"){
  setBusy(id);setError("");
  try{await setNotificationStatus({data:{id,status}});await router.invalidate();}
  catch(e){setError(e instanceof Error?e.message:"Unable to update notification");}
  finally{setBusy(null);}
 }
 async function markAllRead(){
  setBusy("all");setError("");
  try{await readAllNotifications();await router.invalidate();}
  catch(e){setError(e instanceof Error?e.message:"Unable to update notifications");}
  finally{setBusy(null);}
 }
 return <main className="mx-auto max-w-4xl px-5 py-10">
 <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">CAN OS · Notifications</p>
 <h1 className="mt-2 font-serif text-4xl">Notification center</h1>
 <p className="mt-3 text-sm text-muted-foreground">Updates stay linked to their related records. Changes to notification status persist in your account.</p>
 {error&&<p role="alert" className="mt-4 rounded-xl border border-red-400 p-3 text-sm">{error}</p>}
 <div className="mt-6 flex items-center justify-between gap-4 rounded-xl border bg-card p-4"><span className="font-semibold">Unread notifications: {center.unreadCount}</span><button type="button" disabled={!center.unreadCount||busy!==null} onClick={markAllRead} className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50">{busy==="all"?"Saving…":"Mark all as read"}</button></div>
 {([{label:"Needs attention",items:center.unread},{label:"Earlier updates",items:center.earlier}] as const).map(section=><section key={section.label} className="mt-8"><h2 className="font-serif text-2xl">{section.label}</h2>
 <div className="mt-4 space-y-3">{section.items.map(n=><article key={n.id} className="rounded-xl border bg-card p-5"><div className="flex flex-wrap items-center justify-between gap-3"><p className="font-semibold">{n.title}</p><time className="text-xs text-muted-foreground">{new Date(n.date).toLocaleDateString()}</time></div><p className="mt-2 text-sm text-muted-foreground">{n.body}</p><div className="mt-3 flex flex-wrap items-center gap-4">{n.href?<Link to={n.href} className="text-xs font-semibold underline">Open related record →</Link>:<span className="text-xs text-muted-foreground">No supported deep link for this update.</span>}{n.status!=="unread"&&<button type="button" disabled={busy!==null} className="rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50" onClick={()=>changeStatus(n.id,"unread")}>Mark unread</button>}{n.status!=="dismissed"&&<button type="button" disabled={busy!==null} className="rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50" onClick={()=>changeStatus(n.id,"dismissed")}>Dismiss</button>}{n.status==="unread"&&<button type="button" disabled={busy!==null} className="rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50" onClick={()=>markRead(n.id)}>{busy===n.id?"Saving…":"Mark as read"}</button>}</div></article>)}{!section.items.length&&<p className="rounded-xl border p-5 text-sm text-muted-foreground">Nothing here yet.</p>}</div></section>)}
 </main>;
}

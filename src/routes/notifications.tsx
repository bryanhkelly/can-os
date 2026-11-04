import { MutationFeedback, WorkspaceNotice, WorkspacePanel, WorkspaceShell } from "@/components/workspace";
import { NotificationFeed } from "@/components/communication/NotificationFeed";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import {useRef,useState} from "react";
import {createFileRoute,Link,useRouter} from "@tanstack/react-router";
import {getNotifications,readNotification,readAllNotifications,setNotificationStatus} from "@/modules/communication/notification-center.functions";
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
 if(!outcome.ok)return <LoaderFailure eyebrow="Notifications" title="Notification center" outcome={outcome}/>;
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
 const visible=notification?notices.filter(item=>item.id===notification):notices;
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
 return <WorkspaceShell width="wide" eyebrow="Communication / Activity center" title="Notifications" subtitle="Relevant academic, operational, and communication updates, with a clear path to the next action.">
 {notification&&<Link to="/notifications" className="mt-4 inline-block text-sm underline">View all notifications</Link>}
 {notification&&!notices.some(item=>item.id===notification)&&<WorkspaceNotice tone="danger" className="mt-4">This notification is unavailable in your current account.</WorkspaceNotice>}
 <MutationFeedback state={feedback} pendingMessage="Updating notifications..." className="mt-4"/>
 <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
 <NotificationFeed notices={visible} busy={busy} onReadAll={()=>void markAllRead()}
 onStatus={(id,status)=>void(status==="read"?markRead(id):changeStatus(id,status))}/>
 <WorkspacePanel title="Your updates" description="Connected to your signed-in account">
 <p className="text-sm leading-relaxed text-muted-foreground">Open the bell in the top bar from any workspace to check updates. Notification status is saved to your account, and related records retain their own access checks.</p>
 <p className="mt-4 text-sm leading-relaxed text-muted-foreground">Dismissed updates remain available in this center. Delivery history below reports delivery attempts separately from read status.</p>
 </WorkspacePanel>
 </div>
 <DeliveryHistory history={currentHistory.ok?currentHistory.data:null} cursor={deliveryCursor} notification={notification} refreshing={refreshing} onRefresh={()=>void refreshHistory()}/>
 </WorkspaceShell>;
}

import {createFileRoute,Link} from "@tanstack/react-router";
import {getSyntheticNotifications} from "@/modules/student-experience/notifications.functions";
import {groupNotices} from "@/domain/notification-center";
export const Route=createFileRoute("/student/notifications")({loader:()=>getSyntheticNotifications(),component:NotificationsPage});
function NotificationsPage(){
 const notices=Route.useLoaderData();
 const center=groupNotices(notices);
 return <main className="mx-auto max-w-4xl px-5 py-10">
 <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">CAN OS · Synthetic student</p>
 <h1 className="mt-2 font-serif text-4xl">Notification center</h1>
 <p className="mt-3 text-sm text-muted-foreground">Updates stay linked to their related records. Viewing this page does not mark notices as read.</p>
 <div className="mt-6 flex items-center justify-between rounded-xl border bg-card p-4"><span className="font-semibold">Unread notifications</span><span className="rounded-full bg-foreground px-3 py-1 text-sm font-bold text-background">{center.unreadCount}</span></div>
 {([{label:"Needs attention",items:center.unread},{label:"Earlier updates",items:center.earlier}] as const).map(section=><section key={section.label} className="mt-8"><h2 className="font-serif text-2xl">{section.label}</h2>
 <div className="mt-4 space-y-3">{section.items.map(n=><article key={n.id} className="rounded-xl border bg-card p-5"><div className="flex flex-wrap items-center justify-between gap-3"><p className="font-semibold">{n.title}</p><time className="text-xs text-muted-foreground">{new Date(n.date).toLocaleDateString()}</time></div><p className="mt-2 text-sm text-muted-foreground">{n.body}</p>{n.href?<Link to={n.href} className="mt-3 inline-block text-xs font-semibold underline">Open related record →</Link>:<p className="mt-3 text-xs text-muted-foreground">No supported deep link for this update.</p>}</article>)}{!section.items.length&&<p className="rounded-xl border p-5 text-sm text-muted-foreground">Nothing here yet.</p>}</div></section>)}
 </main>;
}

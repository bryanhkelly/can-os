import { createFileRoute } from "@tanstack/react-router";
import { getSyntheticNotifications } from "@/modules/student-experience/notifications.functions";
export const Route=createFileRoute("/student/notifications")({loader:()=>getSyntheticNotifications(),component:NotificationsPage});
function NotificationsPage(){
 const notices=Route.useLoaderData();
 return <main className="mx-auto max-w-4xl px-5 py-10"><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">CAN OS · Student</p><h1 className="mt-2 font-serif text-4xl">Notifications</h1>
 <p className="mt-3 text-sm text-muted-foreground">Feedback and support updates link directly to the relevant record.</p>
 <div className="mt-6 space-y-3">{notices.map(n=><a key={n.id} href={n.href} className="block rounded-xl border border-border bg-card p-5 hover:border-foreground/50"><p className="text-xs text-muted-foreground">{n.status} · {new Date(n.date).toLocaleDateString()}</p><p className="mt-2 font-semibold">{n.title}</p><p className="mt-2 text-sm text-muted-foreground">{n.body}</p><p className="mt-3 text-xs font-semibold">Open related record →</p></a>)}
 {!notices.length&&<p className="rounded-xl border border-border p-5 text-sm">Nothing new yet.</p>}</div></main>;
}

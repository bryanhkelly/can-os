import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight, Bell, BookOpen, CalendarDays, CheckCircle2, ChevronRight,
  Clock3, FileText, HeartHandshake, HelpCircle, MessageCircle, RotateCcw,
  Sparkles, Trophy, UserRound, X,
} from "lucide-react";

type Task = { id: string; title: string; detail: string; source: string; due: string; state: "open" | "done"; kind: "work" | "consent" | "message" | "review" };
type Event = { id: string; title: string; when: string; category: "school" | "activity" | "meeting"; status: "scheduled" | "moved" | "cancelled" };
type FeedItem = { id: string; title: string; detail: string; audience: "site" | "network"; acknowledged: boolean };
const seedTasks: Task[] = [
  { id:"essay", title:"Revise English essay", detail:"Teacher feedback and the next revision are ready",source:"English Literature",due:"Today",state:"open",kind:"work" },
  { id:"permission", title:"Sign field-trip permission",detail:"Science museum • guardian signature required",source:"Household",due:"Friday",state:"open",kind:"consent" },
  { id:"math", title:"Ask for math support",detail:"Get help with completing the square",source:"Algebra II",due:"Flexible",state:"open",kind:"work" },
  { id:"conference", title:"Review conference summary",detail:"Teacher notes and one follow-up",source:"Conferences",due:"This week",state:"done",kind:"review" },
];
const seedEvents: Event[] = [
  {id:"algebra",title:"Algebra II",when:"Mon • 8:30 AM",category:"school",status:"scheduled"},
  {id:"english",title:"English literature · Live",when:"Tue • 10:00 AM",category:"school",status:"scheduled"},
  {id:"chapel",title:"Chapel & service reflection",when:"Wed • 12:15 PM",category:"school",status:"scheduled"},
  {id:"office",title:"Teacher office hours",when:"Thu • 2:00 PM",category:"meeting",status:"scheduled"},
  {id:"track",title:"Track practice",when:"Fri • 3:30 PM",category:"activity",status:"scheduled"},
];
const seedFeed: FeedItem[] = [
  {id:"f1",title:"Campus schedule update",detail:"Check your local Site calendar for any changes",audience:"site",acknowledged:false},
  {id:"f2",title:"CAN reading challenge",detail:"Share one favorite book this month",audience:"network",acknowledged:false},
];
const seedMilestones = [
  {id:"first",title:"First course submitted",detail:"A great start to the term"},
  {id:"service",title:"Service reflection completed",detail:"Making an impact in your community"},
  {id:"revision",title:"Made a revision",detail:"Growth through practice"},
];
type Tab = "queue" | "calendar" | "support" | "portfolio" | "community";
const tabs: {id:Tab;label:string}[] = [
  {id:"queue",label:"Needs You"}, {id:"calendar",label:"Calendar"},
  {id:"support",label:"Support"}, {id:"portfolio",label:"Growth"},
  {id:"community",label:"Community"},
];
function MiniButton({children,onClick}:{children:ReactNode;onClick:()=>void}) {
  return <button onClick={onClick} className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold hover:bg-accent">{children}</button>;
}
export function StudentQuickWins() {
  const [tab,setTab] = useState<Tab>("queue");
  const [tasks,setTasks] = useState(seedTasks);
  const [events,setEvents] = useState(seedEvents);
  const [feed,setFeed] = useState(seedFeed);
  const [selected,setSelected] = useState<Task|null>(null);
  const [period,setPeriod] = useState<"today"|"week">("week");
  const [filter,setFilter] = useState<"all"|"open"|"done">("all");
  const [helpText,setHelpText] = useState("");
  const [requests,setRequests] = useState<string[]>([]);
  const [extension,setExtension] = useState(false);
  const [absence,setAbsence] = useState(false);
  const [checkIn,setCheckIn] = useState(false);
  const [milestones,setMilestones] = useState(["first"]);
  const [personalOrder,setPersonalOrder] = useState(false);
  const [notice,setNotice] = useState("");
  const visibleTasks=tasks.filter(task=>filter==="all"||task.state===filter);
  const openCount=tasks.filter(task=>task.state==="open").length;
  const timeline=useMemo(()=>period==="week"?events:events.slice(0,2),[period,events]);
  const reset=()=>{
    setTasks(seedTasks);setEvents(seedEvents);setFeed(seedFeed);setSelected(null);
    setRequests([]);setHelpText("");setExtension(false);setAbsence(false);
    setCheckIn(false);setMilestones(["first"]);setPersonalOrder(false);setNotice("");
    setTab("queue");setPeriod("week");setFilter("all");
  };
  const completeTask=(id:string)=>{setTasks(prev=>prev.map(task=>task.id===id?{...task,state:"done"}:task));setSelected(null);setNotice("Your demo task is marked complete.")};
  const textInput="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-ring";
  return <div className="min-h-screen bg-background text-foreground">
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
        <Link to="/student" className="text-xs font-semibold text-muted-foreground hover:underline">← Student Today</Link>
        <span className="rounded-full border border-border px-3 py-1 text-[11px] font-bold tracking-wider">SYNTHETIC EXPERIENCE LAB · NOT LIVE SCHOOL RECORDS</span>
        <MiniButton onClick={reset}><RotateCcw size={13} className="mr-1 inline"/> Reset scenarios</MiniButton>
      </div>
      <p className="mt-9 text-xs font-bold uppercase tracking-widest text-muted-foreground">CAN Academy · Student experience</p>
      <h1 className="mt-2 font-serif text-5xl">Everything in one place.</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Try connected everyday school experiences: actions, calendar changes, help requests, office hours, recovery, milestones, and announcements. Changes here are temporary demo interactions.</p>
      <div className="mt-7 flex flex-wrap gap-2" role="tablist" aria-label="Experience area">
        {tabs.map(x=><button role="tab" aria-selected={tab===x.id} key={x.id} onClick={()=>{setTab(x.id);setNotice("")}} className={`rounded-full border px-4 py-2 text-xs font-bold ${tab===x.id?"border-foreground bg-foreground text-background":"border-border bg-card hover:bg-accent"}`}>{x.label}{x.id==="queue" ? ` · ${openCount}` : ""}</button>)}
      </div>
      {notice&&<div role="status" className="mt-5 rounded-xl bg-stone-warm px-4 py-3 text-sm">{notice}</div>}
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <main className="space-y-5">
          {tab==="queue"&&<>
            <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-serif text-3xl">Needs you</h2><div className="flex gap-1">{(["all","open","done"] as const).map(f=><button key={f} onClick={()=>setFilter(f)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${filter===f?"bg-foreground text-background":"bg-card"}`}>{f==="all"?"All":f==="open"?"To do":"Done"}</button>)}</div></div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={personalOrder} onChange={e=>setPersonalOrder(e.target.checked)}/> Prioritize my academic work</label>
            {(personalOrder?[...visibleTasks].sort((a,b)=>(a.kind==="work"?-1:0)-(b.kind==="work"?-1:0)):visibleTasks).map(task=><button key={task.id} onClick={()=>setSelected(task)} className="flex w-full items-center gap-4 rounded-2xl border border-border bg-card p-5 text-left hover:border-foreground/40"><div className="rounded-xl bg-stone-warm p-2">{task.state==="done"?<CheckCircle2 size={20}/>:task.kind==="consent"?<FileText size={20}/>:<BookOpen size={20}/>}</div><div className="flex-1"><p className="text-xs text-muted-foreground">{task.source} · {task.due}</p><p className="mt-1 font-semibold">{task.title}</p><p className="mt-1 text-xs text-muted-foreground">{task.detail}</p></div><ChevronRight size={18}/></button>)}
            {!visibleTasks.length&&<p className="rounded-xl border border-border p-5 text-sm text-muted-foreground">No items in this view.</p>}
          </>}
          {tab==="calendar"&&<>
            <div className="flex items-center justify-between"><h2 className="font-serif text-3xl">One calendar</h2><div className="flex gap-2"><MiniButton onClick={()=>setPeriod("today")}>Today</MiniButton><MiniButton onClick={()=>setPeriod("week")}>Week</MiniButton></div></div>
            <p className="text-sm text-muted-foreground">Academics, formation, sports, and meetings share one timeline. Site changes apply here, not to every campus.</p>
            {timeline.map(event=><div key={event.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-5"><CalendarDays size={19}/><div className="flex-1"><p className="text-xs text-muted-foreground">{event.when} · {event.category}</p><p className={`mt-1 font-semibold ${event.status==="cancelled"?"line-through":""}`}>{event.title}</p><p className="mt-1 text-xs text-muted-foreground">{event.status==="scheduled"?"On schedule":event.status==="moved"?"Rescheduled":"Cancelled"}</p></div><select aria-label={`Update ${event.title}`} value={event.status} onChange={e=>setEvents(prev=>prev.map(x=>x.id===event.id?{...x,status:e.target.value as Event["status"]}:x))} className="max-w-28 rounded-lg border border-border bg-background p-2 text-xs"><option value="scheduled">Scheduled</option><option value="moved">Moved</option><option value="cancelled">Cancelled</option></select></div>)}
            <div className="rounded-2xl bg-stone-warm p-5"><h3 className="font-semibold">Calendar subscription</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">Your Site calendar can be exported once a personalized, permission-aware feed is connected. This prototype does not publish an unrestricted feed.</p></div>
          </>}
          {tab==="support"&&<>
            <h2 className="font-serif text-3xl">Help when you need it</h2><p className="text-sm text-muted-foreground">Tell your teacher or coach what you're working through. In the connected release, this becomes a contextual Action, not a separate inbox.</p>
            <textarea value={helpText} onChange={e=>setHelpText(e.target.value)} rows={4} className={textInput} placeholder="I could use help understanding…"/>
            <button disabled={!helpText.trim()} onClick={()=>{setRequests(p=>[helpText.trim(),...p]);setHelpText("");setNotice("Synthetic help request captured for this session.")}} className="rounded-xl bg-foreground px-5 py-3 text-sm font-semibold text-background disabled:opacity-40"><HelpCircle size={15} className="mr-2 inline"/>Request help</button>
            {requests.map((request,i)=><div key={i} className="rounded-2xl border border-border bg-card p-5"><p className="text-xs text-muted-foreground">Request #{requests.length-i} · Drafted</p><p className="mt-2 text-sm">{request}</p></div>)}
            <div className="rounded-2xl border border-border bg-card p-5"><h3 className="font-semibold">Teacher office hours</h3><p className="mt-2 text-sm text-muted-foreground">Thursday · 2:00–3:00 PM · Online or onsite</p><MiniButton onClick={()=>{setCheckIn(v=>!v);setNotice(checkIn?"Office-hour selection cleared.":"Office-hour selection added to your demo plan.")}}>{checkIn?"Cancel selection":"Choose this time"}</MiniButton></div>
            <div className="rounded-2xl border border-border bg-card p-5"><h3 className="font-semibold">Assignment extension</h3><p className="mt-2 text-sm text-muted-foreground">Request extra time when you have an approved need. A teacher must decide; a request does not change the due date.</p><MiniButton onClick={()=>{setExtension(v=>!v);setNotice(extension?"Extension request removed.":"Extension request drafted. Deadline has not changed.")}}>{extension?"Withdraw request":"Request extra time"}</MiniButton></div>
            <div className="rounded-2xl border border-border bg-card p-5"><h3 className="font-semibold">Absence catch-up</h3><p className="mt-2 text-sm text-muted-foreground">Bring lesson recordings, catch-up work, and teacher check-ins together after a missed day.</p><MiniButton onClick={()=>setAbsence(v=>!v)}>{absence?"Hide catch-up plan":"Show catch-up plan"}</MiniButton>{absence&&<ul className="mt-4 list-disc space-y-2 pl-4 text-sm"><li>Biology lesson notes · 18 min</li><li>English reading response · 20 min</li><li>Teacher check-in · 7 min</li></ul>}</div>
          </>}
          {tab==="portfolio"&&<>
            <h2 className="font-serif text-3xl">Your growth story</h2>
            <div className="grid gap-3 sm:grid-cols-3">{[{label:"Learning streak",value:"3 days"},{label:"Work to revisit",value:"2"},{label:"Milestones",value:String(milestones.length)}].map(item=><div key={item.label} className="rounded-2xl border border-border bg-card p-5"><p className="text-xs text-muted-foreground">{item.label}</p><p className="mt-3 font-serif text-3xl">{item.value}</p></div>)}</div>
            <p className="text-xs text-muted-foreground">Streak values are fictional and do not rank students against one another.</p>
            {seedMilestones.map(item=><div key={item.id} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5"><Trophy size={20}/><div className="flex-1"><p className="font-semibold">{item.title}</p><p className="text-xs text-muted-foreground">{item.detail}</p></div><MiniButton onClick={()=>setMilestones(prev=>prev.includes(item.id)?prev.filter(x=>x!==item.id):[...prev,item.id])}>{milestones.includes(item.id)?"Earned":"Mark in demo"}</MiniButton></div>)}
            <div className="rounded-2xl bg-stone-warm p-5"><h3 className="font-semibold">Student portfolio</h3><p className="mt-2 text-sm text-muted-foreground">Keep work samples, reflections, service, and projects together. Publishing or sharing requires an explicit review flow.</p><MiniButton onClick={()=>setNotice("Your portfolio draft has been opened in this demo. No file was uploaded.")}>Start a reflection</MiniButton></div>
          </>}
          {tab==="community"&&<>
            <h2 className="font-serif text-3xl">Community & announcements</h2>
            {feed.map(item=><div key={item.id} className="rounded-2xl border border-border bg-card p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">{item.audience} announcement</p><h3 className="mt-2 font-semibold">{item.title}</h3><p className="mt-2 text-sm text-muted-foreground">{item.detail}</p><div className="mt-4"><MiniButton onClick={()=>setFeed(prev=>prev.map(x=>x.id===item.id?{...x,acknowledged:!x.acknowledged}:x))}>{item.acknowledged?"Acknowledged ✓":"Acknowledge"}</MiniButton></div></div>)}
            <div className="rounded-2xl bg-stone-warm p-5"><h3 className="font-semibold">Personal learning connections</h3><p className="mt-2 text-sm text-muted-foreground">Study groups, peer support, mentor meetings, and service opportunities will use the same Site-aware schedule and approved group memberships.</p></div>
          </>}
        </main>
        <aside className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5"><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Quick actions</p>
            <button className="mt-4 flex w-full items-center justify-between py-2 text-left text-sm" onClick={()=>setTab("queue")}><span><CheckCircle2 size={16} className="mr-2 inline"/> {openCount} items need you</span><ArrowRight size={15}/></button>
            <button className="flex w-full items-center justify-between py-2 text-left text-sm" onClick={()=>setTab("support")}><span><MessageCircle size={16} className="mr-2 inline"/> Ask for help</span><ArrowRight size={15}/></button>
            <button className="flex w-full items-center justify-between py-2 text-left text-sm" onClick={()=>setTab("calendar")}><span><Clock3 size={16} className="mr-2 inline"/> This week's plan</span><ArrowRight size={15}/></button>
          </div>
          <div className="rounded-2xl bg-stone-warm p-5"><HeartHandshake size={20}/><h3 className="mt-3 font-semibold">A whole-school experience</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Everyday experiences are designed to compose with CAN Actions, Site Calendars, Communications, Documents, and student records.</p></div>
          <div className="rounded-2xl border border-border bg-card p-5"><p className="text-xs text-muted-foreground">Synthetic student</p><p className="mt-1 font-semibold">Jordan Example</p><p className="mt-1 text-xs text-muted-foreground">School operations demonstration. These interactions don't change production student data.</p></div>
        </aside>
      </div>
    </div>
    {selected&&<div className="fixed inset-0 z-40 flex justify-end bg-black/35" onMouseDown={()=>setSelected(null)}>
      <div role="dialog" aria-modal="true" aria-label="Action details" onMouseDown={event=>event.stopPropagation()} className="h-full w-full max-w-md overflow-y-auto bg-card p-7 shadow-xl">
        <button aria-label="Close details" onClick={()=>setSelected(null)} className="float-right rounded-lg border border-border p-2"><X size={18}/></button>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Contextual action · {selected.source}</p><h2 className="mt-4 font-serif text-4xl">{selected.title}</h2><p className="mt-4 text-sm leading-7 text-muted-foreground">{selected.detail}</p>
        <div className="mt-6 rounded-xl bg-stone-warm p-4"><p className="text-xs font-bold">What's next?</p><p className="mt-2 text-sm">Due: {selected.due}. This panel preserves the action context so you don't have to search through several modules.</p></div>
        {selected.state==="open"&&<button onClick={()=>completeTask(selected.id)} className="mt-6 w-full rounded-xl bg-foreground px-4 py-3 text-sm font-bold text-background">Mark complete in demo</button>}
        <button onClick={()=>{setSelected(null);setTab("support")}} className="mt-3 w-full rounded-xl border border-border p-3 text-sm font-semibold">Need help with this?</button>
      </div>
    </div>}
  </div>;
}

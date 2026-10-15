import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft, ArrowRight, BookOpen, CalendarDays, Check, CheckCircle2,
  ChevronRight, CircleAlert, Clock3, Compass, GraduationCap, HeartHandshake,
  LayoutDashboard, Lightbulb, MessageCircle, Play, RotateCcw, Send, Sparkles,
  Target, Video, X,
} from "lucide-react";
import { demoStudent, type StudentWork, type StudentMoment } from "@/modules/student-experience/demo-data";
import type { StudentTodayData } from "@/modules/student-experience/student-today.server";

type Area = "today" | "courses" | "progress";
type WorkState = StudentWork & { submittedText?: string };


const timeLabel = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return `${h! % 12 || 12}:${String(m ?? 0).padStart(2, "0")} ${h! >= 12 ? "PM" : "AM"}`;
};
const momentIcon = (kind: string) =>
  kind === "live" ? Video : kind === "formation" ? HeartHandshake :
  kind === "mentor" ? MessageCircle : BookOpen;

function projectLiveStudent(snapshot: StudentTodayData) {
  const sections = new Map(snapshot.sections.map(row => [row.sectionId, row.sectionTitle]));
  const work: StudentWork[] = snapshot.coursework.map(item => {
    const points = item.pointsPossible ? Number(item.pointsPossible) : 0;
    const grade = item.score !== null && points > 0 ? Math.round(Number(item.score) / points * 100) : undefined;
    const comment = typeof item.feedback?.["comment"] === "string" ? item.feedback["comment"] : undefined;
    return {
      id: item.submissionId,
      course: sections.get(item.sectionId) ?? "Course",
      courseCode: "",
      title: item.assessmentTitle,
      detail: item.instructions ?? "Review your course instructions.",
      due: item.dueAt?.toISOString() ?? "",
      dueLabel: item.dueAt ? new Intl.DateTimeFormat("en-US", {dateStyle:"medium",timeStyle:"short"}).format(new Date(item.dueAt)) : "No due date",
      duration: 20,
      status: item.timeliness === "missing" && item.status === "assigned" ? "missing"
        : item.status === "graded" ? "graded" : item.status === "submitted" ? "submitted" : "assigned",
      grade,
      feedback: comment,
      nextStep: comment ? "Review this feedback and ask your teacher about your next step." : undefined,
      kind: item.timeliness === "missing" ? "revision" : "assignment",
    };
  });
  const moments: StudentMoment[] = snapshot.events.map(event => ({
    id: event.id,
    time: new Date(event.startsAt).toLocaleTimeString("en-US", {hour:"2-digit",minute:"2-digit",hour12:false,timeZone:event.timezone}),
    title: event.title,
    subtitle: event.description ?? "Your local site calendar",
    kind: event.type.includes("chapel") || event.type.includes("formation") ? "formation"
      : event.type.includes("live") ? "live"
      : event.type.includes("mentor") ? "mentor" : "class",
  }));
  const courseCount = snapshot.sections.length;
  const attention = new Set(work.filter(item => item.status === "missing").map(item => item.course));
  return { displayName: snapshot.student.preferredName ?? snapshot.student.firstName,
    site: "CAN Academy · Live Neon data", onTrack: Math.max(0, courseCount - attention.size), courseCount, work, moments };
}

export function StudentExperience({ liveData }: { liveData?: StudentTodayData }) {
  const studentData = useMemo(() => liveData ? projectLiveStudent(liveData) : demoStudent, [liveData]);
  const [area, setArea] = useState<Area>("today");
  const [work, setWork] = useState<WorkState[]>(studentData.work);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [showHelp, setShowHelp] = useState(false);
  const [doneRecovery, setDoneRecovery] = useState<string[]>([]);
  const focused = work.find((item) => item.id === selected);
  const missing = work.filter((item) => item.status === "missing");
  const due = work.filter((item) => item.status === "assigned");
  const completed = work.filter((item) => item.status === "submitted" || item.status === "graded");
  const courses = [...new Set(work.map((item) => item.course))];
  const recovery = work.filter((item) => item.status === "missing" || (item.grade !== undefined && item.grade < 80));
  const day = studentData.moments;

  const filtered = useMemo(() =>
    work.filter((item) => courseFilter === "all" || item.course === courseFilter),
    [courseFilter, work],
  );

  function openWork(item: WorkState) {
    setSelected(item.id);
    setDraft(item.submittedText ?? "");
    setConfirmation(null);
  }
  function submit() {
    if (!focused || !draft.trim()) return;
    setWork((previous) => previous.map((item) => item.id === focused.id
      ? { ...item, status: "submitted", submittedText: draft.trim() } : item));
    setConfirmation(`Submitted successfully. Your work for “${focused.title}” is saved.`);
  }
  function reset() {
    setWork(studentData.work);
    setDoneRecovery([]);
    setSelected(null);
    setConfirmation(null);
    setCourseFilter("all");
    setArea("today");
  }

  return (
    <div className="min-h-screen bg-background text-foreground" data-workspace-category="Learning">
      <div className="mx-auto max-w-6xl px-4 pb-28 pt-5 sm:px-8 sm:pt-8">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-foreground text-background"><GraduationCap size={20}/></div>
            <div><p className="text-[10px] font-bold uppercase tracking-[.22em] text-muted-foreground">CAN Academy</p><p className="text-sm font-semibold">Student workspace</p></div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-muted-foreground">{liveData ? "LIVE NEON · READ ONLY" : "INTERACTIVE DEMO · NO LIVE DATA"}</span>
            <button onClick={reset} className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium hover:bg-accent" title="Reset demonstration"><RotateCcw size={14}/></button>
          </div>
        </div>

        <div className="grid gap-9 pt-8 lg:grid-cols-[225px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-8 space-y-5">
              <div><p className="text-xs text-muted-foreground">Your learning space</p><h2 className="mt-1 font-serif text-3xl">Make today count.</h2></div>
              <div className="space-y-1">
                {([
                  ["today", LayoutDashboard, "Today"],
                  ["courses", BookOpen, "Courses"],
                  ["progress", Target, "My progress"],
                ] as const).map(([id, Icon, label]) => (
                  <button key={id} onClick={() => {setArea(id);setSelected(null)}} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors ${area === id ? "bg-foreground font-semibold text-background" : "text-muted-foreground hover:bg-accent"}`}>
                    <Icon size={17}/>{label}
                  </button>
                ))}
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Your support team</p>
                <p className="mt-3 text-sm font-medium">You don't have to figure it out alone.</p>
                <button onClick={() => setShowHelp(true)} className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold underline underline-offset-4">Get learning help <ArrowRight size={13}/></button>
              </div>
            </div>
          </aside>

          <main className="min-w-0">\n            <Link to="/student/support" className="mb-4 flex items-center justify-between rounded-2xl border border-border bg-card p-4 text-sm font-semibold hover:border-foreground/30"><span>Student support · Teacher referrals & specialist caseload</span><ArrowRight size={17}/></Link>\n            <Link to="/student/assignments" className="mb-4 flex items-center justify-between rounded-2xl border border-border bg-card p-4 text-sm font-semibold hover:border-foreground/30"><span>Assignments · Submit work & review feedback</span><ArrowRight size={17}/></Link>\n            <Link to="/student/courses" className="mb-4 flex items-center justify-between rounded-2xl border border-border bg-card p-4 text-sm font-semibold hover:border-foreground/30"><span>Choose classes · Add, drop & withdrawal</span><ArrowRight size={17}/></Link>
            <Link to="/student/experiences" className="mb-6 flex items-center justify-between rounded-2xl border border-border bg-card p-4 text-sm font-semibold hover:border-foreground/30"><span>Explore more: Needs You, calendar, support, activities & growth</span><ArrowRight size={17}/></Link>
            {focused ? (
              <section className="animate-fade-up">
                <button onClick={() => {setSelected(null);setConfirmation(null)}} className="mb-7 inline-flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground"><ArrowLeft size={15}/> Back to {area === "courses" ? "courses" : "Today"}</button>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{focused.course} · {focused.courseCode}</p>
                <h1 className="mt-2 font-serif text-4xl sm:text-5xl">{focused.title}</h1>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><Clock3 size={14}/>{focused.dueLabel}</span><span>·</span><span>About {focused.duration} minutes</span></div>
                <div className="mt-8 grid gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
                  <div className="space-y-5">
                    <div className="rounded-2xl border border-border bg-card p-6">
                      <h2 className="text-sm font-bold">Your assignment</h2>
                      <p className="mt-3 text-sm leading-7 text-muted-foreground">{focused.detail}</p>
                    </div>
                    {focused.feedback && (
                      <div className="rounded-2xl border border-border bg-card p-6">
                        <div className="flex items-center gap-2"><Lightbulb size={17}/><h2 className="text-sm font-bold">Teacher feedback</h2></div>
                        {focused.grade !== undefined && <p className="mt-3 font-serif text-4xl">{focused.grade}<span className="text-lg text-muted-foreground">%</span></p>}
                        <p className="mt-3 text-sm leading-7 text-muted-foreground">{focused.feedback}</p>
                        <div className="mt-5 rounded-xl bg-stone-warm p-4"><p className="text-xs font-bold">Your next step</p><p className="mt-1 text-sm leading-6">{focused.nextStep}</p></div>
                      </div>
                    )}
                    {confirmation ? (
                      <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900">
                        <CheckCircle2 size={28}/><h2 className="mt-3 text-lg font-bold">You're all set.</h2>
                        <p className="mt-2 text-sm">{confirmation}</p>
                        <button onClick={() => {setSelected(null);setConfirmation(null)}} className="mt-5 rounded-lg bg-emerald-900 px-4 py-2 text-sm font-semibold text-white">Return to Today</button>
                      </div>
                    ) : focused.status === "submitted" ? (
                      <div className="rounded-2xl border border-border bg-card p-6"><CheckCircle2 className="text-emerald-700"/><h2 className="mt-3 font-semibold">Work submitted</h2><p className="mt-1 text-sm text-muted-foreground">Your submission is saved in this demonstration.</p>{focused.submittedText && <p className="mt-4 border-t pt-4 text-sm">{focused.submittedText}</p>}</div>
                    ) : liveData ? (
                      <div className="rounded-2xl border border-border bg-card p-6">
                        <h2 className="text-sm font-bold">Assignment from Neon</h2>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">This live student view is read-only until a verified student session can authorize submissions. Nothing entered here will change your records.</p>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-border bg-card p-6">
                        <h2 className="text-sm font-bold">{focused.status === "missing" ? "Your revision" : "Your response"}</h2>
                        <p className="mt-2 text-xs text-muted-foreground">Write a response to try the complete-and-submit flow. Attachments will be added in a later phase.</p>
                        <textarea aria-label="Your assignment response" value={draft} onChange={(event)=>setDraft(event.target.value)} rows={7} placeholder="Start writing here…" className="mt-4 w-full resize-y rounded-xl border border-border bg-background p-4 text-sm outline-none focus:ring-2 focus:ring-ring"/>
                        <button disabled={!draft.trim()} onClick={submit} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-foreground px-5 py-3 text-sm font-semibold text-background disabled:opacity-40"><Send size={16}/> Submit work</button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-border bg-card p-5"><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Keep moving</p><p className="mt-2 text-sm leading-6">Need help understanding this assignment?</p><button onClick={()=>setShowHelp(true)} className="mt-4 flex items-center gap-2 text-xs font-semibold"><Sparkles size={15}/> Ask for a breakdown <ChevronRight size={14}/></button></div>
                  </div>
                </div>
              </section>
            ) : area === "today" ? (
              <section className="animate-fade-up">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-[.18em] text-muted-foreground">Thursday · October 15</p><h1 className="mt-2 font-serif text-5xl sm:text-6xl">Good morning, {studentData.displayName}.</h1><p className="mt-3 text-sm text-muted-foreground">A clear day starts here. Here's what matters.</p></div><div className="rounded-full bg-card px-3 py-2 text-xs text-muted-foreground"><CalendarDays size={14} className="mr-2 inline"/> {studentData.site}</div></div>
                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-foreground p-5 text-background sm:col-span-2"><p className="text-[10px] font-bold uppercase tracking-widest opacity-65">Your learning pulse</p><p className="mt-3 font-serif text-3xl">{studentData.onTrack} of {studentData.courseCount} courses on track</p><p className="mt-2 text-xs opacity-70">One course needs a little attention. You have a path forward.</p></div>
                  <div className="rounded-2xl border border-border bg-card p-5"><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Worth your attention</p><p className="mt-3 font-serif text-4xl">{due.length + missing.length}</p><p className="mt-1 text-xs text-muted-foreground">Open tasks · {missing.length} to recover</p></div>
                </div>
                <div className="mt-10 grid gap-10 xl:grid-cols-[minmax(0,1fr)_290px]">
                  <div>
                    <div className="mb-4 flex items-center justify-between"><h2 className="font-serif text-3xl">Your day</h2><span className="text-xs text-muted-foreground">{day.length} moments</span></div>
                    <div className="overflow-hidden rounded-2xl border border-border bg-card">
                      {day.map((moment, index) => {
                        const Icon=momentIcon(moment.kind);
                        return <div key={moment.id} className={`flex gap-4 p-4 sm:p-5 ${index ? "border-t border-border" : ""}`}>
                          <span className="w-16 shrink-0 pt-1 text-xs font-semibold text-muted-foreground">{timeLabel(moment.time)}</span>
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-stone-warm"><Icon size={19}/></div>
                          <div className="min-w-0 flex-1"><p className="font-semibold text-sm">{moment.title}</p><p className="mt-1 text-xs text-muted-foreground">{moment.subtitle}</p></div>
                          {moment.kind === "live" && <span className="self-start rounded-full bg-stone-warm px-2.5 py-1 text-[10px] font-semibold">Live</span>}
                        </div>;
                      })}
                    </div>
                    <div className="mt-9 flex items-center justify-between"><h2 className="font-serif text-3xl">To do</h2><span className="text-xs text-muted-foreground">Most urgent first</span></div>
                    <div className="mt-4 space-y-3">{[...missing, ...due].map((item) => <WorkRow key={item.id} item={item} onClick={()=>openWork(item)}/>)}</div>
                    {!missing.length && !due.length && <div className="mt-4 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">Your required work is caught up. Nice work.</div>}
                  </div>
                  <aside className="space-y-5">
                    <div className="rounded-2xl border border-border bg-card p-5"><div className="flex items-center gap-2"><Compass size={18}/><h2 className="text-sm font-bold">Your path back</h2></div><p className="mt-2 text-xs leading-6 text-muted-foreground">A few small steps can make a big difference.</p>
                      <div className="mt-5 space-y-3">{recovery.map((item)=> <button key={item.id} onClick={()=>openWork(item)} className="flex w-full gap-3 text-left text-sm hover:underline"><span className="mt-0.5"><CircleAlert size={16}/></span><span><span className="block font-medium">{item.title}</span><span className="mt-1 block text-xs text-muted-foreground">{item.duration} min · {item.course}</span></span></button>)}</div>
                    </div>
                    <div className="rounded-2xl bg-stone-warm p-5"><div className="flex gap-2"><HeartHandshake size={18}/><p className="text-sm font-semibold">More than coursework</p></div><p className="mt-3 text-sm leading-6 text-muted-foreground">Chapel, service, mentoring and community are part of your day, not a separate checklist.</p></div>
                  </aside>
                </div>
              </section>
            ) : area === "courses" ? (
              <section className="animate-fade-up"><p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Learn</p><h1 className="mt-2 font-serif text-5xl">Your courses</h1><p className="mt-3 text-sm text-muted-foreground">See what is next, what is done, and where you can get help.</p>
                <div className="mt-7 flex flex-wrap gap-2">{["all",...courses].map((course)=> <button key={course} onClick={()=>setCourseFilter(course)} className={`rounded-full border px-4 py-2 text-xs font-semibold ${courseFilter===course?"border-foreground bg-foreground text-background":"border-border bg-card"}`}>{course==="all"?"All courses":course}</button>)}</div>
                <div className="mt-6 space-y-3">{filtered.map(item=><WorkRow key={item.id} item={item} onClick={()=>openWork(item)}/>)}</div>
              </section>
            ) : (
              <section className="animate-fade-up"><p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Your growth</p><h1 className="mt-2 font-serif text-5xl">My progress</h1><p className="mt-3 text-sm text-muted-foreground">Progress means knowing what you've learned—and what you can improve next.</p>
                <div className="mt-8 grid gap-4 sm:grid-cols-3"><Stat label="Courses on track" value={`${studentData.onTrack}/${studentData.courseCount}`}/><Stat label="Completed work" value={String(completed.length)}/><Stat label="Needs a next step" value={String(recovery.length)}/></div>
                <h2 className="mt-10 font-serif text-3xl">Learn from feedback</h2>
                <div className="mt-4 space-y-3">{work.filter(item=>item.feedback).map(item=><button key={item.id} onClick={()=>openWork(item)} className="flex w-full items-center gap-4 rounded-2xl border border-border bg-card p-5 text-left hover:border-foreground/30"><div className="font-serif text-4xl">{item.grade}%</div><div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">{item.course}</p><p className="mt-1 text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.nextStep}</p></div><ChevronRight size={18}/></button>)}</div>
                <h2 className="mt-10 font-serif text-3xl">Recovery steps</h2>
                <p className="mt-2 text-xs text-muted-foreground">Try checking off a step as you plan your learning. These checkmarks are demo-only.</p>
                <div className="mt-4 space-y-3">{recovery.map(item=><label key={item.id} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-sm"><input type="checkbox" checked={doneRecovery.includes(item.id)} onChange={(event)=>setDoneRecovery(prev=>event.target.checked?[...prev,item.id]:prev.filter(id=>id!==item.id))} className="mt-0.5 size-4"/><span className="flex-1"><span className={`font-semibold ${doneRecovery.includes(item.id)?"line-through text-muted-foreground":""}`}>{item.title}</span><span className="mt-1 block text-xs text-muted-foreground">{item.nextStep ?? item.detail}</span></span><button type="button" onClick={(e)=>{e.preventDefault();openWork(item)}} className="text-xs font-semibold underline underline-offset-4">Open</button></label>)}</div>
              </section>
            )}
          </main>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-3 gap-2">
          {([["today",LayoutDashboard,"Today"],["courses",BookOpen,"Courses"],["progress",Target,"Progress"]] as const).map(([id,Icon,label])=>
            <button key={id} onClick={()=>{setArea(id);setSelected(null)}} className={`flex flex-col items-center gap-1 rounded-xl p-2 text-[11px] font-semibold ${area===id?"bg-stone-warm text-foreground":"text-muted-foreground"}`}><Icon size={20}/>{label}</button>
          )}
        </div>
      </div>
      {showHelp && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center" onMouseDown={()=>setShowHelp(false)}>
          <div role="dialog" aria-modal="true" aria-label="Learning help" onMouseDown={(e)=>e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between"><div className="flex items-center gap-2 text-sm font-bold"><Sparkles size={17}/> Ask CAN · Coming next</div><button aria-label="Close" onClick={()=>setShowHelp(false)}><X size={19}/></button></div>
            <h2 className="mt-5 font-serif text-3xl">How can we help?</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">A future learning companion will explain assignments, guide practice, and help plan recovery. This demo does not send requests to an AI service.</p>
            <div className="mt-5 space-y-2">{["Break this assignment into steps","Help me plan my catch-up work","Explain my teacher's feedback"].map(text=><p key={text} className="rounded-xl bg-stone-warm px-4 py-3 text-sm">{text}</p>)}</div>
            <button onClick={()=>setShowHelp(false)} className="mt-6 w-full rounded-lg bg-foreground py-3 text-sm font-semibold text-background">Got it</button>
          </div>
        </div>
      )}
    </div>
  );
}
function WorkRow({item,onClick}:{item:StudentWork;onClick:()=>void}) {
 const label=item.status==="missing"?"Recover":item.status==="graded"?"Feedback":item.status==="submitted"?"Submitted":"Due";
 return <button onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-all hover:border-foreground/25 hover:shadow-sm sm:p-5">
  <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${item.status==="submitted"?"bg-emerald-50 text-emerald-800":"bg-stone-warm"}`}>{item.status==="submitted"?<Check size={19}/>:item.status==="missing"?<RotateCcw size={19}/>:<BookOpen size={19}/>}</div>
  <div className="min-w-0 flex-1"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{item.course} · {label}</p><p className="mt-1 text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.status==="graded"?item.nextStep:item.dueLabel} · {item.duration} min</p></div>
  <ChevronRight size={18} className="shrink-0 text-muted-foreground"/>
 </button>;
}
function Stat({label,value}:{label:string;value:string}) {
 return <div className="rounded-2xl border border-border bg-card p-5"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-3 font-serif text-4xl">{value}</p></div>;
}

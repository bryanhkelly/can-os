import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createPersonalEvent,
  getCalendarMonth,
  moveAssessmentDueDate,
  reviseCalendarEvent,
  type CalendarFeedItem,
} from "@/modules/calendar/calendar.functions";
import { dateKeyInTimezone, dateTimeInputInTimezone, dateTimeInputValue } from "@/modules/calendar/timezone";
import { calendarSources, filterCalendarItems, type CalendarSource } from "@/domain/calendar-view";

export const Route = createFileRoute("/calendar")({
  validateSearch:(search:Record<string,unknown>):{date?:string;event?:string;section?:string;source?:CalendarSource;view?:"month"|"agenda"}=>({
    date:typeof search.date==="string"?z.string().date().parse(search.date):undefined,
    event:typeof search.event==="string"?search.event:undefined,
    section:typeof search.section==="string"?search.section:undefined,
    source:calendarSources.find(source=>source===search.source),
    view:search.view==="agenda"||search.view==="month"?search.view:undefined,
  }),
  component: CalendarPage,
});

type MonthData = Awaited<ReturnType<typeof getCalendarMonth>>;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatTime(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  }
}

type RevisionInput =
  | { action: "edit"; eventId: string; title: string; description?: string | null }
  | { action: "reschedule"; eventId: string; startsAt: string; endsAt?: string | null }
  | { action: "cancel"; eventId: string };

function typeLabel(item: CalendarFeedItem): string {
  if (item.source === "assessment") return "Due";
  if (item.source === "personal") return "Personal";
  if (item.source === "study_group") return "Study group";
  if (item.source === "section") return "Section";
  return "Site";
}

function chipClass(item: CalendarFeedItem): string {
  if (item.source === "assessment") return "border-amber-300 bg-amber-50 text-amber-900";
  if (item.source === "personal") return "border-emerald-300 bg-emerald-50 text-emerald-900";
  if (item.source === "study_group") return "border-violet-300 bg-violet-50 text-violet-900";
  if (item.source === "section") return "border-sky-300 bg-sky-50 text-sky-900";
  return "border-border bg-background";
}

function CalendarPage() {
  const search=Route.useSearch();
  const navigate=Route.useNavigate();
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [data, setData] = useState<MonthData | null>(null);
  const [items, setItems] = useState<CalendarFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formStart, setFormStart] = useState("09:00");
  const [formEnd, setFormEnd] = useState("");
  const [saving, setSaving] = useState(false);
  const [manageMode, setManageMode] = useState<{ id: string; mode: "edit" | "reschedule" } | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [moveDate, setMoveDate] = useState("");
  const [moveStart, setMoveStart] = useState("09:00");
  const [moveEnd, setMoveEnd] = useState("");

  const load = useCallback((y: number, m: number) => {
    setLoading(true);
    setError("");
    getCalendarMonth({ data: { year: y, month: m } })
      .then((result) => {
        setData(result);
        setItems(result.items);
        setLoading(false);
      })
      .catch(() => {
        setError("Sign in to view your calendar.");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load(year, month);
  }, [year, month, load]);

  useEffect(()=>{
    if(!search.date)return;
    const [requestedYear,requestedMonth]=search.date.split("-").map(Number);
    setYear(requestedYear!);setMonth(requestedMonth!);
    setSelectedDay(search.date);setFormDate(search.date);
    setManageMode(null);setConfirmCancelId(null);
  },[search.date,search.event]);

  const visibleItems=useMemo(()=>filterCalendarItems(items,search),[items,search.source,search.section]);
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarFeedItem[]>();
    for (const item of visibleItems) {
      const key = dateKeyInTimezone(item.startsAt, item.timezone);
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return map;
  }, [visibleItems]);

  const cells = useMemo(() => {
    const first = new Date(year, month - 1, 1);
    const daysInMonth = new Date(year, month, 0).getDate();
    const blanks = first.getDay();
    const list: ({ key: string; day: number } | null)[] = [];
    for (let i = 0; i < blanks; i += 1) list.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      list.push({ key: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, day });
    }
    return list;
  }, [year, month]);

  const isTeacher = data?.viewerRole === "teacher";
  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));

  const shiftMonth = (delta: number) => {
    const next = new Date(year, month - 1 + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth() + 1);
    setSelectedDay(null);
  };

  const openDay = (key: string) => {
    setSelectedDay(key);
    setFormDate(key);
    setNotice("");
    setManageMode(null);
    setConfirmCancelId(null);
  };

  const startManage = (item: CalendarFeedItem, mode: "edit" | "reschedule") => {
    setConfirmCancelId(null);
    setError("");
    setNotice("");
    if (mode === "edit") {
      setEditTitle(item.title);
      setEditDescription(item.description ?? "");
    } else {
      const startsAt = dateTimeInputValue(item.startsAt, item.timezone);
      setMoveDate(startsAt.slice(0, 10));
      setMoveStart(startsAt.slice(11));
      setMoveEnd(item.endsAt ? dateTimeInputValue(item.endsAt, item.timezone).slice(11) : "");
    }
    setManageMode({ id: item.id, mode });
  };

  const runRevision = (data: RevisionInput, done: string) => {
    if (saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    reviseCalendarEvent({ data })
      .then(() => {
        setNotice(done);
        setManageMode(null);
        setConfirmCancelId(null);
        load(year, month);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to update event"))
      .finally(() => setSaving(false));
  };

  const submitManage = (item: CalendarFeedItem) => {
    if (!manageMode || manageMode.id !== item.id) return;
    if (manageMode.mode === "edit") {
      runRevision(
        { action: "edit", eventId: item.id, title: editTitle.trim(), description: editDescription.trim() || null },
        `Updated "${item.title}".`,
      );
      return;
    }
    if (!moveDate || !moveStart) return;
    try {
      const startsAt = dateTimeInputInTimezone(`${moveDate}T${moveStart}`, item.timezone);
      const endsAt = moveEnd ? dateTimeInputInTimezone(`${moveDate}T${moveEnd}`, item.timezone) : null;
      runRevision(
        { action: "reschedule", eventId: item.id, startsAt, endsAt },
        `Moved "${item.title}" to ${moveDate} (${item.timezone}).`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enter a valid date and time");
    }
  };

  const submitCancel = (item: CalendarFeedItem) => {
    runRevision({ action: "cancel", eventId: item.id }, `Cancelled "${item.title}".`);
  };

  const submitEvent = () => {
    const title = formTitle.trim();
    if (!title || !formDate || !formStart || saving) return;
    setError("");
    setNotice("");
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    let startsAt: string;
    let endsAt: string | undefined;
    try {
      startsAt = dateTimeInputInTimezone(`${formDate}T${formStart}`, timezone);
      endsAt = formEnd ? dateTimeInputInTimezone(`${formDate}T${formEnd}`, timezone) : undefined;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enter a valid date and time");
      return;
    }
    setSaving(true);
    createPersonalEvent({ data: { title, startsAt, endsAt, timezone } })
      .then(() => {
        setFormTitle("");
        setNotice("Personal event saved.");
        load(year, month);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to save event"))
      .finally(() => setSaving(false));
  };

  const onDragStart = (event: React.DragEvent, item: CalendarFeedItem) => {
    if (!isTeacher || item.source !== "assessment") return;
    event.dataTransfer.setData("text/plain", item.id);
    event.dataTransfer.effectAllowed = "move";
  };

  const onDrop = (event: React.DragEvent, targetKey: string) => {
    if (!isTeacher) return;
    const id = event.dataTransfer.getData("text/plain");
    if (!id.startsWith("assessment:")) return;
    event.preventDefault();
    const item = items.find((entry) => entry.id === id);
    if (!item || dateKeyInTimezone(item.startsAt, item.timezone) === targetKey) return;
    const previous = items;
    const original = new Date(item.startsAt);
    const originalTime = dateTimeInputValue(item.startsAt, item.timezone).slice(11);
    let newDueAt: string;
    try {
      newDueAt = dateTimeInputInTimezone(`${targetKey}T${originalTime}`, item.timezone);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enter a valid date and time");
      return;
    }
    setItems(items.map((entry) => (entry.id === id ? { ...entry, startsAt: newDueAt } : entry)));
    setError("");
    setNotice("");
    moveAssessmentDueDate({ data: { assessmentId: id.slice("assessment:".length), newDueAt } })
      .then(() => setNotice(`Moved "${item.title}" to ${targetKey}.`))
      .catch((err) => {
        setItems(previous);
        setError(err instanceof Error ? err.message : "Unable to move due date");
      });
  };

  const selectedItems = selectedDay ? (byDay.get(selectedDay) ?? []) : [];

  return (
    <main className="min-h-screen bg-background px-6 py-10 text-foreground">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">CAN OS · Calendar</p>
        <h1 className="mt-2 font-serif text-4xl">Calendar</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Site and section events, assignment due dates, and your personal events in one calendar.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
          <nav aria-label="Calendar view" className="flex gap-2 text-sm">
            {(["month","agenda"] as const).map(view=><Link key={view} to="/calendar" search={{...search,view}} aria-current={(search.view??"month")===view?"page":undefined}
              className={"rounded-lg border px-3 py-2 "+((search.view??"month")===view?"bg-foreground text-background":"")}>{view==="month"?"Month":"Agenda"}</Link>)}
          </nav>
          <label className="text-sm">Show
            <select value={search.source??""} onChange={event=>void navigate({search:{...search,source:calendarSources.find(source=>source===event.target.value),event:undefined}})} className="ml-2 rounded-lg border bg-background p-2">
              <option value="">All event types</option>
              <option value="section">Class events</option><option value="assessment">Assignment deadlines</option>
              <option value="site">School events</option><option value="personal">Personal</option><option value="study_group">Study groups</option>
            </select>
          </label>
          {search.section&&<><span className="text-sm">Selected class only</span><Link to="/calendar" search={{...search,section:undefined,event:undefined}} className="text-sm underline">Show all classes</Link></>}
          {data?.viewerRole==="student"&&<Link to="/calendar-export" className="text-sm underline">Export deadlines (.ics)</Link>}
        </div>

        {error && <p role="alert" className="mt-4 rounded-lg border border-red-300 p-3 text-sm">{error}</p>}
        {notice && <p role="status" className="mt-4 rounded-lg border border-emerald-300 p-3 text-sm">{notice}</p>}

        <div className="mt-6 flex items-center gap-3">
          <button type="button" onClick={() => shiftMonth(-1)} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold">← Prev</button>
          <h2 className="font-serif text-2xl">{monthLabel}</h2>
          <button type="button" onClick={() => shiftMonth(1)} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold">Next →</button>
          {loading && <span className="text-xs text-muted-foreground">Loading…</span>}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
          {search.view==="agenda"?<section aria-label="Calendar agenda" className="rounded-xl border bg-card p-5">
            <h2 className="font-semibold">Agenda · {monthLabel}</h2>
            <ul className="mt-4 divide-y">{visibleItems.map(item=><li key={item.id} className="py-4">
              <Link to="/calendar" search={{...search,date:dateKeyInTimezone(item.startsAt,item.timezone),event:item.id}} className="font-semibold underline">{item.title}</Link>
              <p className="mt-1 text-sm text-muted-foreground">{dateKeyInTimezone(item.startsAt,item.timezone)} · {formatTime(item.startsAt,item.timezone)} · {typeLabel(item)}{item.cancelled?" · Cancelled":""}</p>
            </li>)}</ul>
            {!visibleItems.length&&!loading&&<p className="mt-4 text-sm text-muted-foreground">No events match this calendar view.</p>}
          </section>:<div className="min-w-0 overflow-x-auto rounded-xl border bg-card p-5">
            <div className="min-w-[28rem]">
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {WEEKDAYS.map((day) => <div key={day} className="py-1">{day}</div>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {cells.map((cell, index) =>
                cell ? (
                  <button
                    key={cell.key}
                    type="button"
                    onClick={() => openDay(cell.key)}
                    onDragOver={(event) => {
                      if (isTeacher) event.preventDefault();
                    }}
                    onDrop={(event) => onDrop(event, cell.key)}
                    className={`min-h-24 rounded-lg border p-1.5 text-left align-top text-xs ${
                      selectedDay === cell.key ? "border-foreground" : "border-border"
                    } ${isTeacher ? "cursor-pointer" : ""}`}
                  >
                    <span className="font-semibold">{cell.day}</span>
                    <span className="mt-1 flex flex-col gap-1">
                      {(byDay.get(cell.key) ?? []).map((item) => (
                        <span
                          key={item.id}
                          draggable={isTeacher && item.source === "assessment"}
                          onDragStart={(event) => onDragStart(event, item)}
                          title={`${typeLabel(item)} · ${item.title}`}
                          className={`block truncate rounded border px-1 py-0.5 ${chipClass(item)} ${
                            isTeacher && item.source === "assessment" ? "cursor-grab" : ""
                          }`}
                        >
                          {typeLabel(item)} · {item.title}
                        </span>
                      ))}
                    </span>
                  </button>
                ) : (
                  <div key={`blank-${index}`} className="min-h-24 rounded-lg border border-transparent" />
                ),
              )}
            </div>
            </div>
          </div>}

          <aside className="rounded-xl border bg-card p-5">
            <h3 className="font-semibold">{selectedDay ? `Events on ${selectedDay}` : "Select a day"}</h3>
            {search.event&&selectedDay===search.date&&!loading&&!error&&!selectedItems.some(item=>item.id===search.event)&&<p role="alert" className="mt-3 text-sm">This event is unavailable on the requested date in your current calendar.</p>}
            {selectedDay && (
              <ul className="mt-3 space-y-2">
                {selectedItems.map((item) => (
                  <li key={item.id} className={`rounded-lg border p-3 text-sm ${search.event===item.id?"ring-2 ring-primary ":""}${item.cancelled ? "border-red-200 bg-red-50/40" : "border-border"}`}>
                    <p className="font-semibold">
                      {item.source==="assessment"&&data?.viewerRole==="student"?<Link to="/student/assignments" search={{assessment:item.id.slice("assessment:".length)}} className="underline">{item.title}</Link>:item.title}
                      {item.cancelled && <span className="ml-2 rounded border border-red-300 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">Cancelled</span>}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {typeLabel(item)} · {formatTime(item.startsAt, item.timezone)}
                      {item.endsAt ? ` – ${formatTime(item.endsAt, item.timezone)}` : ""}
                    </p>
                    {item.description && <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>}

                    {item.manageable && !manageMode && confirmCancelId !== item.id && (
                      <div className="mt-2 flex gap-2">
                        <button type="button" onClick={() => startManage(item, "edit")} className="rounded border border-border px-2 py-1 text-xs font-semibold">Edit</button>
                        <button type="button" onClick={() => startManage(item, "reschedule")} className="rounded border border-border px-2 py-1 text-xs font-semibold">Move</button>
                        <button type="button" onClick={() => setConfirmCancelId(item.id)} className="rounded border border-red-300 px-2 py-1 text-xs font-semibold text-red-700">Cancel event</button>
                      </div>
                    )}

                    {confirmCancelId === item.id && (
                      <div className="mt-2 rounded-lg border border-red-300 p-2">
                        <p className="text-xs">Cancel "{item.title}"? Participants are notified and the change is audited.</p>
                        <div className="mt-2 flex gap-2">
                          <button type="button" disabled={saving} onClick={() => submitCancel(item)} className="rounded bg-red-700 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50">Confirm cancellation</button>
                          <button type="button" onClick={() => setConfirmCancelId(null)} className="rounded border border-border px-2 py-1 text-xs font-semibold">Keep event</button>
                        </div>
                      </div>
                    )}

                    {manageMode?.id === item.id && manageMode.mode === "edit" && (
                      <div className="mt-2 space-y-2 border-t border-border pt-2">
                        <label className="block text-xs">
                          Title
                          <input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} required minLength={3} maxLength={200} className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm" />
                        </label>
                        <label className="block text-xs">
                          Description
                          <textarea value={editDescription} onChange={(event) => setEditDescription(event.target.value)} maxLength={2000} rows={2} className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm" />
                        </label>
                      </div>
                    )}

                    {manageMode?.id === item.id && manageMode.mode === "reschedule" && (
                      <div className="mt-2 space-y-2 border-t border-border pt-2">
                        <label className="block text-xs">
                          Date
                          <input type="date" value={moveDate} onChange={(event) => setMoveDate(event.target.value)} required className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm" />
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                          <label className="block text-xs">
                            Start
                            <input type="time" value={moveStart} onChange={(event) => setMoveStart(event.target.value)} required className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm" />
                          </label>
                          <label className="block text-xs">
                            End (optional)
                            <input type="time" value={moveEnd} onChange={(event) => setMoveEnd(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm" />
                          </label>
                        </div>
                        <p className="text-xs text-muted-foreground">Times use {item.timezone}.</p>
                      </div>
                    )}

                    {manageMode?.id === item.id && (
                      <div className="mt-2 flex gap-2">
                        <button type="button" disabled={saving} onClick={() => submitManage(item)} className="rounded bg-foreground px-2 py-1 text-xs font-semibold text-background disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
                        <button type="button" onClick={() => setManageMode(null)} className="rounded border border-border px-2 py-1 text-xs font-semibold">Back</button>
                      </div>
                    )}
                  </li>
                ))}
                {selectedItems.length === 0 && <li className="text-xs text-muted-foreground">Nothing scheduled.</li>}
              </ul>
            )}

            {selectedDay && (
              <form
                className="mt-6 border-t border-border pt-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  submitEvent();
                }}
              >
                <h4 className="text-sm font-semibold">Add event</h4>
                <label className="mt-3 block text-xs">
                  Title
                  <input
                    value={formTitle}
                    onChange={(event) => setFormTitle(event.target.value)}
                    required
                    minLength={3}
                    maxLength={200}
                    className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm"
                  />
                </label>
                <label className="mt-3 block text-xs">
                  Date
                  <input
                    type="date"
                    value={formDate}
                    onChange={(event) => setFormDate(event.target.value)}
                    required
                    className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm"
                  />
                </label>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <label className="block text-xs">
                    Start
                    <input
                      type="time"
                      value={formStart}
                      onChange={(event) => setFormStart(event.target.value)}
                      required
                      className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm"
                    />
                  </label>
                  <label className="block text-xs">
                    End (optional)
                    <input
                      type="time"
                      value={formEnd}
                      onChange={(event) => setFormEnd(event.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm"
                    />
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="mt-4 w-full rounded-lg bg-foreground px-3 py-2 text-sm font-semibold text-background disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save personal event"}
                </button>
              </form>
            )}

            {isTeacher && (
              <p className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
                Drag a Due chip onto another day to move that assessment's due date.
              </p>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createPersonalEvent,
  getCalendarMonth,
  moveAssessmentDueDate,
  type CalendarFeedItem,
} from "@/modules/calendar/calendar.functions";

export const Route = createFileRoute("/calendar")({ component: CalendarPage });

type MonthData = Awaited<ReturnType<typeof getCalendarMonth>>;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatTime(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  }
}

function typeLabel(item: CalendarFeedItem): string {
  if (item.source === "assessment") return "Due";
  if (item.source === "personal") return "Personal";
  if (item.source === "section") return "Section";
  return "Site";
}

function chipClass(item: CalendarFeedItem): string {
  if (item.source === "assessment") return "border-amber-300 bg-amber-50 text-amber-900";
  if (item.source === "personal") return "border-emerald-300 bg-emerald-50 text-emerald-900";
  if (item.source === "section") return "border-sky-300 bg-sky-50 text-sky-900";
  return "border-border bg-background";
}

function CalendarPage() {
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

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarFeedItem[]>();
    for (const item of items) {
      const key = dayKey(item.startsAt);
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return map;
  }, [items]);

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
  };

  const submitEvent = () => {
    const title = formTitle.trim();
    if (!title || !formDate || !formStart || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    const startsAt = new Date(`${formDate}T${formStart}`).toISOString();
    const endsAt = formEnd ? new Date(`${formDate}T${formEnd}`).toISOString() : undefined;
    createPersonalEvent({ data: { title, startsAt, endsAt } })
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
    if (!item || dayKey(item.startsAt) === targetKey) return;
    const previous = items;
    const original = new Date(item.startsAt);
    const target = new Date(`${targetKey}T00:00:00`);
    target.setHours(original.getHours(), original.getMinutes(), original.getSeconds());
    const newDueAt = target.toISOString();
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
          Site and section events, assignment due dates, and your personal events in one month view.
        </p>

        {error && <p role="alert" className="mt-4 rounded-lg border border-red-300 p-3 text-sm">{error}</p>}
        {notice && <p role="status" className="mt-4 rounded-lg border border-emerald-300 p-3 text-sm">{notice}</p>}

        <div className="mt-6 flex items-center gap-3">
          <button type="button" onClick={() => shiftMonth(-1)} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold">← Prev</button>
          <h2 className="font-serif text-2xl">{monthLabel}</h2>
          <button type="button" onClick={() => shiftMonth(1)} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold">Next →</button>
          {loading && <span className="text-xs text-muted-foreground">Loading…</span>}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="rounded-xl border bg-card p-5">
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

          <aside className="rounded-xl border bg-card p-5">
            <h3 className="font-semibold">{selectedDay ? `Events on ${selectedDay}` : "Select a day"}</h3>
            {selectedDay && (
              <ul className="mt-3 space-y-2">
                {selectedItems.map((item) => (
                  <li key={item.id} className="rounded-lg border border-border p-3 text-sm">
                    <p className="font-semibold">{item.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {typeLabel(item)} · {formatTime(item.startsAt, item.timezone)}
                      {item.endsAt ? ` – ${formatTime(item.endsAt, item.timezone)}` : ""}
                    </p>
                    {item.description && <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>}
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

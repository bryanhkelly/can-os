import { mutationErrorMessage, useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { z } from "zod";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPersonalEvent,
  getCalendarMonth,
  getCalendarRange,
  listCalendarInviteOptions,
  moveAssessmentDueDate,
  reviseCalendarEvent,
  type CalendarFeedItem,
} from "@/modules/calendar/calendar.functions";
import { addCalendarDays, calendarWeekday, dateKeyInTimezone, dateOnlyDayBoundsInTimezone, dateTimeInputInTimezone, dateTimeInputValue, formatDateOnly } from "@/modules/calendar/timezone";
import { calendarSources, calendarViews, calendarEventDetailsDestination, calendarItemDestination, calendarRecordDestination, filterCalendarItems, type CalendarSource, type CalendarView } from "@/domain/calendar-view";
import { WorkspacePanel, WorkspaceShell } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";

export const Route = createFileRoute("/calendar")({
  validateSearch:(search:Record<string,unknown>):{date?:string;event?:string;section?:string;source?:CalendarSource;view?:CalendarView;q?:string}=>({
    date:typeof search.date==="string"&&z.string().date().safeParse(search.date).success?search.date:undefined,
    event:typeof search.event==="string"?search.event:undefined,
    section:typeof search.section==="string"?search.section:undefined,
    source:calendarSources.find(source=>source===search.source),
    view:calendarViews.find(view=>view===search.view),
    q:typeof search.q==="string"?search.q.slice(0,120):undefined,
  }),
  component: CalendarPage,
});

type MonthData = Awaited<ReturnType<typeof getCalendarMonth>>;
type InviteOptions = Awaited<ReturnType<typeof listCalendarInviteOptions>>;
type InviteGroup = InviteOptions["groups"][number];
type InviteContact = InviteOptions["contacts"][number];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatTime(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  }
}

function formatEventDate(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: timezone,
    }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(new Date(iso));
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
  if (item.type === "class_time") return "Class time";
  if (item.type === "chapel") return "Chapel";
  if (item.type === "field_trip") return "Field trip";
  if (item.source === "section") return "Section";
  return "School";
}

function chipClass(): string {
  return "border-border bg-muted text-primary";
}

const MAX_CALENDAR_RANGE_MS = 3 * 24 * 60 * 60 * 1000;
const CALENDAR_TIMEZONE_PADDING_MS = 14 * 60 * 60 * 1000;

async function loadCalendarRange(view: "day" | "week", date: string, timezone: string): Promise<MonthData> {
  const startsOn = view === "week" ? addCalendarDays(date, -calendarWeekday(date)) : date;
  const endsOn = addCalendarDays(startsOn, view === "week" ? 7 : 1);
  const start = dateOnlyDayBoundsInTimezone(startsOn, timezone).start.getTime() - CALENDAR_TIMEZONE_PADDING_MS;
  const end = dateOnlyDayBoundsInTimezone(endsOn, timezone).start.getTime() + CALENDAR_TIMEZONE_PADDING_MS;
  const windows: { startsAt: string; endsAt: string }[] = [];

  for (let cursor = start; cursor < end;) {
    const windowEnd = Math.min(cursor + MAX_CALENDAR_RANGE_MS, end);
    windows.push({ startsAt: new Date(cursor).toISOString(), endsAt: new Date(windowEnd).toISOString() });
    cursor = windowEnd;
  }

  const results = await Promise.all(windows.map(window => getCalendarRange({ data: window })));
  const first = results[0];
  if (!first) throw new Error("Unable to load the requested calendar range.");
  const items = new Map(results.flatMap(result => result.items).map(item => [item.id, item]));
  return {
    ...first,
    items: [...items.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    truncated: results.some(result => result.truncated),
  };
}

function CalendarPage() {
  const search=Route.useSearch();
  const navigate=Route.useNavigate();
  const today = useMemo(() => new Date(), []);
  const viewerTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const todayKey = dateKeyInTimezone(today.toISOString(), viewerTimezone);
  const view = search.view ?? "month";
  const anchorDate = search.date ?? todayKey;
  const year = Number(anchorDate.slice(0,4));
  const month = Number(anchorDate.slice(5,7));
  const [data, setData] = useState<MonthData | null>(null);
  const [items, setItems] = useState<CalendarFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDate, setFormDate] = useState(todayKey);
  const [composerOpen, setComposerOpen] = useState(false);
  const [inviteSearch, setInviteSearch] = useState("");
  const [inviteContacts, setInviteContacts] = useState<InviteContact[]>([]);
  const [inviteContactsError, setInviteContactsError] = useState("");
  const [inviteGroups, setInviteGroups] = useState<InviteGroup[]>([]);
  const [inviteGroupsError, setInviteGroupsError] = useState("");
  const [inviteePersonIds, setInviteePersonIds] = useState<string[]>([]);
  const [inviteGroupIds, setInviteGroupIds] = useState<string[]>([]);
  const selectedDay = view === "day" || view === "week" ? anchorDate : search.date ?? null;
  const [formStart, setFormStart] = useState("09:00");
  const [formEnd, setFormEnd] = useState("");
  const [eventAttempted,setEventAttempted]=useState(false);
  const [manageAttempted,setManageAttempted]=useState(false);
  const [manageMode, setManageMode] = useState<{ id: string; mode: "edit" | "reschedule" } | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [moveDate, setMoveDate] = useState("");
  const [moveStart, setMoveStart] = useState("09:00");
  const [moveEnd, setMoveEnd] = useState("");
  const loadVersion = useRef(0);
  const titleInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async (y: number, m: number) => {
    const version = ++loadVersion.current;
    setLoading(true);
    setError("");
    setData(null);
    setItems([]);
    try {
      const result = view === "day" || view === "week"
        ? await loadCalendarRange(view, anchorDate, viewerTimezone)
        : await getCalendarMonth({ data: { year: y, month: m } });
      if(version!==loadVersion.current)return;
      setData(result);
      setItems(result.items);
      const [inviteOptionsResult] = await Promise.allSettled([
        result.viewerRole === "room_facilitator"
          ? Promise.resolve({ contacts: [] as InviteOptions["contacts"], groups: [] as InviteGroup[] })
          : listCalendarInviteOptions(),
      ]);
      if(version!==loadVersion.current)return;
      if (inviteOptionsResult?.status === "fulfilled") {
        setInviteContacts(inviteOptionsResult.value.contacts);
        setInviteContactsError("");
        setInviteGroups(inviteOptionsResult.value.groups);
        setInviteGroupsError("");
      } else {
        setInviteContacts([]);
        setInviteContactsError("The authorized address list is unavailable. Try reloading before inviting people.");
        setInviteGroups([]);
        setInviteGroupsError("Authorized groups are unavailable. Try reloading before inviting a group.");
      }
      return result;
    } finally {
      if(version===loadVersion.current)setLoading(false);
    }
  }, [anchorDate, view, viewerTimezone]);
  const mutation = useMutationFeedback(() => load(year, month));
  const saving = mutation.pending || mutation.refreshFailed;

  useEffect(() => {
    void load(year, month).catch(() => setError("Unable to load your calendar. Sign in or reload to try again."));
    return () => { loadVersion.current++; };
  }, [year, month, load]);

  useEffect(()=>{
    if(!selectedDay)return;
    setFormDate(selectedDay);
    setManageMode(null);setConfirmCancelId(null);
  },[selectedDay,search.event]);

  const visibleItems=useMemo(()=>filterCalendarItems(items,search),[items,search.source,search.section,search.q]);
  const viewDates = useMemo(() => view === "week"
    ? Array.from({ length: 7 }, (_, index) => addCalendarDays(anchorDate, index - calendarWeekday(anchorDate)))
    : view === "day" ? [anchorDate] : [], [anchorDate, view]);
  const periodItems = useMemo(() => viewDates.length
    ? visibleItems.filter(item => viewDates.includes(dateKeyInTimezone(item.startsAt, item.timezone)))
    : visibleItems, [visibleItems, viewDates]);
  const sectionOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const item of items) {
      if (!item.sectionId) continue;
      const label = item.source === "assessment" ? item.description || item.title : item.title;
      if (!options.has(item.sectionId)) options.set(item.sectionId, label);
    }
    return [...options].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [items]);
  function itemDestination(item: CalendarFeedItem) {
    return calendarEventDetailsDestination(
      item.id,
      dateKeyInTimezone(item.startsAt,item.timezone),
      search,
    );
  }
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarFeedItem[]>();
    for (const item of periodItems) {
      const key = dateKeyInTimezone(item.startsAt, item.timezone);
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return map;
  }, [periodItems]);

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
  const isRoomFacilitator = data?.viewerRole === "room_facilitator";
  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
  const periodLabel = view === "day" ? formatDateOnly(anchorDate)
    : view === "week" ? `${formatDateOnly(viewDates[0]!)} – ${formatDateOnly(viewDates[6]!)}`
    : monthLabel;

  const shiftMonth = (delta: number) => {
    const next = new Date(year, month - 1 + delta, 1);
    const date = `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,"0")}-01`;
    void navigate({search:{...search,date,event:undefined}});
  };

  const shiftPeriod = (delta: number) => {
    if (view === "day" || view === "week") {
      const date = addCalendarDays(anchorDate, delta * (view === "week" ? 7 : 1));
      void navigate({ search: { ...search, date, event: undefined } });
      return;
    }
    shiftMonth(delta);
  };

  const goToToday = () => void navigate({ search: { ...search, date: todayKey, event: undefined } });

  const chooseDate = (date: string) => {
    if (date) void navigate({ search: { ...search, date, event: undefined } });
  };

  const openDay = (key: string) => {
    void navigate({search:{...search,date:key,event:undefined}});
    setFormDate(key);
    setManageMode(null);
    setConfirmCancelId(null);
  };

  const onCalendarDayKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, key: string) => {
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    const offset = offsets[event.key];
    if (offset === undefined) return;
    event.preventDefault();
    const nextDate = addCalendarDays(key, offset);
    openDay(nextDate);
    requestAnimationFrame(() => document.getElementById(`calendar-day-${nextDate}`)?.focus());
  };

  const startManage = (item: CalendarFeedItem, mode: "edit" | "reschedule") => {
    setConfirmCancelId(null);
    setError("");
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
    setError("");
    void mutation.run(async () => {
        const result = await reviseCalendarEvent({ data });
        setManageMode(null);
        setConfirmCancelId(null);
        return result;
      }, { successMessage: done, commandErrorMessage: "Unable to update event." });
  };

  const submitManage = (item: CalendarFeedItem) => {
    if (!manageMode || manageMode.id !== item.id) return;
    setManageAttempted(true);
    if (manageMode.mode === "edit") {
      if (editTitle.trim().length < 3) return;
      runRevision(
        { action: "edit", eventId: item.id, title: editTitle.trim(), description: editDescription.trim() || null },
        `Updated "${item.title}".`,
      );
      return;
    }
    if (!moveDate || !moveStart || (moveEnd&&moveEnd<=moveStart)) return;
    try {
      const startsAt = dateTimeInputInTimezone(`${moveDate}T${moveStart}`, item.timezone);
      const endsAt = moveEnd ? dateTimeInputInTimezone(`${moveDate}T${moveEnd}`, item.timezone) : null;
      runRevision(
        { action: "reschedule", eventId: item.id, startsAt, endsAt },
        `Moved "${item.title}" to ${moveDate} (${item.timezone}).`,
      );
    } catch (err) {
      setError(mutationErrorMessage(err, "Enter a valid date and time"));
    }
  };

  const submitCancel = (item: CalendarFeedItem) => {
    runRevision({ action: "cancel", eventId: item.id }, `Cancelled "${item.title}".`);
  };

  const openEventComposer = () => {
    setFormDate(selectedDay ?? anchorDate);
    setEventAttempted(false);
    setError("");
    setComposerOpen(true);
  };

  const submitEvent = () => {
    const title = formTitle.trim();
    setEventAttempted(true);
    if (title.length<3 || !formDate || !formStart || (formEnd&&formEnd<=formStart) || saving) return;
    if (selectedInviteeCount > 100) {
      setError("Choose no more than 100 people for one event.");
      return;
    }
    if (inviteGroupIds.length > 50) {
      setError("Choose no more than 50 groups for one event.");
      return;
    }
    setError("");
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    let startsAt: string;
    let endsAt: string | undefined;
    try {
      startsAt = dateTimeInputInTimezone(`${formDate}T${formStart}`, timezone);
      endsAt = formEnd ? dateTimeInputInTimezone(`${formDate}T${formEnd}`, timezone) : undefined;
    } catch (err) {
      setError(mutationErrorMessage(err, "Enter a valid date and time"));
      return;
    }
    void mutation.run(async () => {
        const result = await createPersonalEvent({ data: {
          title, description: formDescription.trim() || undefined,
          startsAt, endsAt, timezone, inviteePersonIds, groupIds: inviteGroupIds,
        } });
        setFormTitle("");
        setFormDescription("");
        setInviteePersonIds([]);
        setInviteGroupIds([]);
        setInviteSearch("");
        setEventAttempted(false);
        setComposerOpen(false);
        await navigate({ search: { ...search, date: formDate, event: result.eventId } });
        return result;
      }, {
        successMessage: inviteePersonIds.length || inviteGroupIds.length
          ? "Event saved and invitations sent."
          : "Personal event saved.",
        commandErrorMessage: "Unable to save event.",
      });
  };

  const onDragStart = (event: React.DragEvent, item: CalendarFeedItem) => {
    if (!isTeacher || item.source !== "assessment") return;
    event.dataTransfer.setData("text/plain", item.id);
    event.dataTransfer.effectAllowed = "move";
  };

  const onDrop = async (event: React.DragEvent, targetKey: string) => {
    if (!isTeacher || saving) return;
    const id = event.dataTransfer.getData("text/plain");
    if (!id.startsWith("assessment:")) return;
    event.preventDefault();
    const item = items.find((entry) => entry.id === id);
    if (!item || dateKeyInTimezone(item.startsAt, item.timezone) === targetKey) return;
    const previous = items;
    const originalTime = dateTimeInputValue(item.startsAt, item.timezone).slice(11);
    let newDueAt: string;
    try {
      newDueAt = dateTimeInputInTimezone(`${targetKey}T${originalTime}`, item.timezone);
    } catch (err) {
      setError(mutationErrorMessage(err, "Enter a valid date and time"));
      return;
    }
    setError("");
    const outcome = await mutation.run(() => {
      setItems(items.map((entry) => (entry.id === id ? { ...entry, startsAt: newDueAt } : entry)));
      return moveAssessmentDueDate({ data: { assessmentId: id.slice("assessment:".length), newDueAt } });
    }, { successMessage: `Moved "${item.title}" to ${targetKey}.`, commandErrorMessage: "Unable to move due date." });
    if (outcome.status === "failed") setItems(previous);
  };

  const selectedItems = selectedDay ? (byDay.get(selectedDay) ?? []) : [];
  const groupPeople = new Map<string, { personId: string; name: string; label: string }>();
  for (const group of inviteGroups) {
    for (const member of group.members) {
      const current = groupPeople.get(member.personId);
      groupPeople.set(member.personId, {
        personId: member.personId,
        name: member.name,
        label: current ? `${current.label}; ${group.title}` : `${group.kind.replaceAll("_", " ")} member · ${group.title}`,
      });
    }
  }
  const inviteDirectory = new Map(inviteContacts.map(contact => [contact.personId, contact]));
  for (const [personId, person] of groupPeople) {
    if (!inviteDirectory.has(personId)) inviteDirectory.set(personId, person);
  }
  const normalizedInviteSearch = inviteSearch.trim().toLowerCase();
  const visibleInvitePeople = [...inviteDirectory.values()].filter(contact =>
    !normalizedInviteSearch || `${contact.name} ${contact.label}`.toLowerCase().includes(normalizedInviteSearch));
  const visibleInviteGroups = inviteGroups.filter(group =>
    !normalizedInviteSearch || group.title.toLowerCase().includes(normalizedInviteSearch) ||
    group.members.some(member => member.name.toLowerCase().includes(normalizedInviteSearch)));
  const groupInviteeIds = new Set(inviteGroups.filter(group => inviteGroupIds.includes(group.id))
    .flatMap(group => group.members.map(member => member.personId)));
  const selectedInviteeCount = new Set([...groupInviteeIds, ...inviteePersonIds]).size;
  const selectedInviteeNames = [...inviteDirectory.values()].filter(contact =>
    inviteePersonIds.includes(contact.personId) && !groupInviteeIds.has(contact.personId));
  const selectedEvent = selectedItems.find(item => item.id === search.event);
  const assignmentDestination = selectedEvent && calendarItemDestination(selectedEvent, data?.viewerRole);
  const recordDestination = selectedEvent && calendarRecordDestination(selectedEvent, data?.viewerRole);
  const recordLabel = selectedEvent?.source === "section" ? "Open class"
    : selectedEvent?.source === "study_group" ? "Open study group" : "Open field trip";

  if (search.event) {
    if (loading) {
      return <WorkspaceShell eyebrow="Calendar" title="Event details">
        <p role="status" className="mt-6">Loading event details...</p>
      </WorkspaceShell>;
    }

    if (!selectedEvent) {
      return <WorkspaceShell eyebrow="Calendar" title="Event unavailable">
        <p role="alert" className="mt-6 border border-danger/50 bg-danger/10 p-4 text-sm">
          This event is unavailable on the requested date in your current calendar.
        </p>
        <Link to="/calendar" search={{ ...search, event: undefined }} className="mt-5 inline-block text-sm font-semibold text-primary underline">
          Back to calendar
        </Link>
      </WorkspaceShell>;
    }

    const eventTime = `${formatTime(selectedEvent.startsAt, selectedEvent.timezone)}${selectedEvent.endsAt
      ? ` – ${formatTime(selectedEvent.endsAt, selectedEvent.timezone)}`
      : ""}`;

    return <WorkspaceShell
      width="wide"
      eyebrow="Calendar"
      title={assignmentDestination
        ? <Link {...assignmentDestination} className="underline decoration-2 underline-offset-4">{selectedEvent.title}</Link>
        : recordDestination
          ? <Link {...recordDestination} className="underline decoration-2 underline-offset-4">{selectedEvent.title}</Link>
          : selectedEvent.title}
      subtitle={<>{typeLabel(selectedEvent)}
        {selectedEvent.studyGroup && <> · {recordDestination
          ? <Link {...recordDestination} className="text-primary underline">{selectedEvent.studyGroup.title}</Link>
          : selectedEvent.studyGroup.title}</>}
        {" · "}{formatEventDate(selectedEvent.startsAt, selectedEvent.timezone)} · {eventTime}</>}
      breadcrumbs={<><Link to="/calendar" search={{ ...search, event: undefined }} className="text-primary underline">Calendar</Link><span>/</span><span>{selectedEvent.title}</span></>}
      actions={assignmentDestination
        ? <Link {...assignmentDestination} className="text-sm font-semibold text-primary underline">Open assignment</Link>
        : recordDestination &&
          <Link {...recordDestination} className="text-sm font-semibold text-primary underline">{recordLabel}</Link>}
      rail={<WorkspacePanel title="Record context" className="rounded-none shadow-none">
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Calendar status</dt>
            <dd className="mt-1">
              <span className={`inline-flex items-center border px-2 py-1 text-xs font-medium ${selectedEvent.cancelled
                ? "border-danger/50 bg-danger/10 text-danger"
                : "border-border bg-muted text-muted-foreground"}`}>
                {selectedEvent.cancelled ? "Cancelled" : "On calendar"}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Event type</dt>
            <dd className="mt-1">{typeLabel(selectedEvent)}</dd>
          </div>
          {selectedEvent.studyGroup && <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Study group</dt>
            <dd className="mt-1">{recordDestination
              ? <Link {...recordDestination} className="text-primary underline">{selectedEvent.studyGroup.title}</Link>
              : selectedEvent.studyGroup.title}</dd>
          </div>}
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Time zone</dt>
            <dd className="mt-1">{selectedEvent.timezone}</dd>
          </div>
        </dl>
      </WorkspacePanel>}
    >
      <div className="mt-6 grid gap-5">
        <WorkspacePanel title="Event details" description="Schedule and description for this calendar event." className="rounded-none shadow-none">
          <dl className="grid gap-5 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date</dt>
              <dd className="mt-1 text-sm">{formatEventDate(selectedEvent.startsAt, selectedEvent.timezone)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Time</dt>
              <dd className="mt-1 text-sm">{eventTime} <span className="text-muted-foreground">{selectedEvent.timezone}</span></dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</dt>
              <dd className="mt-1 text-sm">{typeLabel(selectedEvent)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</dt>
              <dd className="mt-1 text-sm">{selectedEvent.cancelled ? "Cancelled" : "On calendar"}</dd>
            </div>
            {!!selectedEvent.teachers?.length && <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {selectedEvent.teachers.length > 1 ? "Teachers" : "Teacher"}
              </dt>
              <dd className="mt-1 text-sm">{selectedEvent.teachers.map((teacher, index) => <span key={teacher.personId}>
                {index > 0 && ", "}<Link to="/profiles" search={{ person: teacher.personId }} className="underline underline-offset-2">{teacher.name}</Link>
              </span>)}</dd>
            </div>}
          </dl>
        </WorkspacePanel>
        <WorkspacePanel title="Description" className="rounded-none shadow-none">
          <p className="whitespace-pre-wrap text-sm leading-6">
            {selectedEvent.description || "No additional description has been provided."}
          </p>
        </WorkspacePanel>
        {selectedEvent.manageable&&<WorkspacePanel title="Manage event" className="rounded-none shadow-none">
          {manageMode?.id!==selectedEvent.id&&confirmCancelId!==selectedEvent.id&&<div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={()=>startManage(selectedEvent,"edit")} className="rounded-none">Edit details</Button>
            <Button type="button" variant="outline" onClick={()=>startManage(selectedEvent,"reschedule")} className="rounded-none">Move event</Button>
            <Button type="button" variant="outline" onClick={()=>setConfirmCancelId(selectedEvent.id)} className="rounded-none border-danger/50 text-danger hover:bg-danger/10">Cancel event</Button>
          </div>}
          {manageMode?.id===selectedEvent.id&&manageMode.mode==="edit"&&<div className="space-y-3">
            <Field label="Title" required error={manageAttempted&&editTitle.trim().length<3?"Enter a title with at least 3 characters.":undefined}>
              <Input value={editTitle} onChange={event=>setEditTitle(event.target.value)} minLength={3} maxLength={200} className="rounded-none" />
            </Field>
            <Field label="Description">
              <Textarea value={editDescription} onChange={event=>setEditDescription(event.target.value)} maxLength={2000} rows={3} className="rounded-none shadow-none" />
            </Field>
            <div className="flex gap-2">
              <Button type="button" variant="outline" disabled={saving} onClick={()=>submitManage(selectedEvent)} className="rounded-none">{saving?"Saving…":"Save"}</Button>
              <Button type="button" variant="outline" onClick={()=>{setManageMode(null);setManageAttempted(false);}} className="rounded-none">Back</Button>
            </div>
          </div>}
          {manageMode?.id===selectedEvent.id&&manageMode.mode==="reschedule"&&<div className="space-y-3">
            <Field label="Date" required error={manageAttempted&&!moveDate?"Choose a date.":undefined}>
              <Input type="date" value={moveDate} onChange={event=>setMoveDate(event.target.value)} className="rounded-none" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Start" required error={manageAttempted&&!moveStart?"Choose a start time.":undefined}>
                <Input type="time" value={moveStart} onChange={event=>setMoveStart(event.target.value)} className="rounded-none" />
              </Field>
              <Field label="End (optional)" error={manageAttempted&&moveEnd&&moveEnd<=moveStart?"Choose an end after the start.":undefined}>
                <Input type="time" value={moveEnd} onChange={event=>setMoveEnd(event.target.value)} className="rounded-none" />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">Times use {selectedEvent.timezone}.</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" disabled={saving} onClick={()=>submitManage(selectedEvent)} className="rounded-none">{saving?"Saving…":"Save"}</Button>
              <Button type="button" variant="outline" onClick={()=>{setManageMode(null);setManageAttempted(false);}} className="rounded-none">Back</Button>
            </div>
          </div>}
          {confirmCancelId===selectedEvent.id&&<div className="border border-danger/50 bg-danger/10 p-3">
            <p className="text-sm">Cancel “{selectedEvent.title}”? Participants are notified and the change is audited.</p>
            <div className="mt-3 flex gap-2">
              <Button type="button" variant="destructive" size="sm" disabled={saving} onClick={()=>submitCancel(selectedEvent)} className="rounded-none">Confirm cancellation</Button>
              <Button type="button" variant="outline" size="sm" onClick={()=>setConfirmCancelId(null)} className="rounded-none">Keep event</Button>
            </div>
          </div>}
        </WorkspacePanel>}
        {data?.viewerRole === "guardian" && selectedEvent.source === "assessment" &&
          (selectedEvent.guardianStudents?.length ?? 0) > 1 && <WorkspacePanel title="Student assignments" className="rounded-none shadow-none">
          <ul className="space-y-3 text-sm">{selectedEvent.guardianStudents!.map(student => {
            const destination = calendarItemDestination(selectedEvent, "guardian", student.studentPersonId);
            return destination ? <li key={student.studentPersonId}>
              <Link {...destination} className="font-semibold text-primary underline">{student.studentName} · {selectedEvent.title}</Link>
            </li> : null;
          })}</ul>
        </WorkspacePanel>}
      </div>
    </WorkspaceShell>;
  }

  return (
    <WorkspaceShell width="wide" eyebrow={isRoomFacilitator ? "My Room" : "Calendar"} title={isRoomFacilitator ? "Room schedule" : "Calendar"} subtitle={isRoomFacilitator ? "School events and events for Sections assigned to your room." : "Site and section events, assignment due dates, and your personal events in one calendar."}
      actions={data && !isRoomFacilitator && <Button type="button" size="lg" onClick={openEventComposer} className="min-h-12 px-6 text-base shadow-sm"><Plus aria-hidden="true" />Create event</Button>}>
        <div className="mt-5 flex flex-wrap items-center gap-3 border border-border bg-card p-3">
          <nav aria-label="Calendar view" className="flex gap-2 text-sm">
            {calendarViews.map(nextView=><Link key={nextView} to="/calendar" search={{...search,view:nextView,date:nextView==="month"||nextView==="agenda"?search.date:anchorDate,event:undefined}} aria-current={view===nextView?"page":undefined}
              className={"inline-flex min-h-10 items-center border px-3 py-2 focus-visible:outline-2 focus-visible:outline-ring "+(view===nextView?"border-primary bg-primary text-primary-foreground":"border-border bg-card text-foreground hover:bg-muted")}>{nextView[0]!.toUpperCase()+nextView.slice(1)}</Link>)}
          </nav>
          <label className="flex min-h-10 items-center text-sm">
            <span className="sr-only">Search calendar events</span>
            <Input type="search" value={search.q??""} onChange={event=>void navigate({search:{...search,q:event.target.value||undefined,event:undefined}})} placeholder="Search events" className="min-h-10 w-48 rounded-none shadow-none" />
          </label>
          <label className="flex items-center text-sm">Show
            <Select value={search.source??""} onChange={event=>void navigate({search:{...search,source:calendarSources.find(source=>source===event.target.value),event:undefined}})} className="ml-2 min-h-10 w-auto max-w-full rounded-none shadow-none">
              <option value="">{isRoomFacilitator ? "All room events" : "All event types"}</option>
              <option value="section">Class events</option>{!isRoomFacilitator&&<><option value="assessment">Assignment deadlines</option>
              <option value="personal">Personal</option><option value="study_group">Study groups</option></>}
              <option value="site">School events</option>
            </Select>
          </label>
          {sectionOptions.length>0&&<label className="flex items-center text-sm">Section
            <Select value={search.section??""} onChange={event=>void navigate({search:{...search,section:event.target.value||undefined,event:undefined}})} className="ml-2 min-h-10 w-auto max-w-full rounded-none shadow-none">
              <option value="">All sections</option>
              {sectionOptions.map(section=><option key={section.id} value={section.id}>{section.label}</option>)}
            </Select>
          </label>}
          {search.section&&<><span className="text-sm">Selected class only</span><Link to="/calendar" search={{...search,section:undefined,event:undefined}} className="text-sm text-primary underline">Show all classes</Link></>}
          {data?.viewerRole==="student"&&<Link to="/calendar-export" className="text-sm text-primary underline">Export deadlines (.ics)</Link>}
        </div>

        {error && !composerOpen && <p role="alert" className="mt-4 border border-danger/50 bg-danger/10 p-3 text-sm">{error}</p>}
        {data?.truncated&&<p role="status" className="mt-4 border border-warning/50 bg-warning/10 p-3 text-sm">Some activities are not shown because this view reached its display limit. Narrow the date range or filters.</p>}
        {!composerOpen && <MutationFeedback state={mutation} className="mt-4" pendingMessage="Saving calendar change..."/>}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={goToToday} className="rounded-none">Today</Button>
          <Button type="button" variant="outline" aria-label={`Previous ${view}`} onClick={() => shiftPeriod(-1)} className="rounded-none"><ChevronLeft aria-hidden="true" />Prev</Button>
          <h2 className="font-serif text-section">{periodLabel}</h2>
          <Button type="button" variant="outline" aria-label={`Next ${view}`} onClick={() => shiftPeriod(1)} className="rounded-none">Next<ChevronRight aria-hidden="true" /></Button>
          <Input type="date" aria-label="Choose calendar date" value={anchorDate} onChange={event=>chooseDate(event.target.value)} className="w-auto rounded-none shadow-none" />
          {loading && <span className="text-xs text-muted-foreground">Loading…</span>}
        </div>

        <div className={`mt-6 grid gap-6 ${view==="week"?"":"lg:grid-cols-[2fr_1fr]"}`}>
          {view==="agenda"||view==="day"?<section aria-label={view==="day"?`Events on ${anchorDate}`:"Calendar agenda"} className="border border-border bg-card p-5">
            <h2 className="font-semibold">{view==="day"?`Agenda · ${formatDateOnly(anchorDate)}`:`Agenda · ${monthLabel}`}</h2>
            <ul className="mt-4 divide-y">{periodItems.map(item=><li key={item.id} className="py-4">
              <Link {...itemDestination(item)} className="font-semibold text-primary underline">{item.title}</Link>
              <p className="mt-1 text-sm text-muted-foreground">{dateKeyInTimezone(item.startsAt,item.timezone)} · {formatTime(item.startsAt,item.timezone)} · {item.timezone} · {typeLabel(item)}{item.cancelled?" · Cancelled":""}</p>
            </li>)}</ul>
            {!periodItems.length&&!loading&&<p className="mt-4 text-sm text-muted-foreground">No events match this calendar view.</p>}
          </section>:view==="week"?<section aria-label="Calendar week" className="grid grid-cols-1 border border-border bg-card md:grid-cols-7">
            {viewDates.map(day=><section key={day} aria-label={`Events on ${day}`} className="min-w-0 border-b border-border p-3 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
              <h3 className="border-b border-border pb-2 text-sm font-semibold">
                <Link to="/calendar" search={{...search,view:"day",date:day,event:undefined}} className="text-primary underline">{new Intl.DateTimeFormat("en-US",{weekday:"short",month:"short",day:"numeric"}).format(new Date(`${day}T12:00:00Z`))}</Link>
              </h3>
              <ul className="divide-y divide-border">{(byDay.get(day)??[]).map(item=><li key={item.id} className="min-w-0 py-3 text-xs">
                <Link {...itemDestination(item)} className="block break-words font-semibold text-primary underline">{item.title}</Link>
                <p className="mt-1 break-words text-muted-foreground">{formatTime(item.startsAt,item.timezone)} · {typeLabel(item)}{item.cancelled?" · Cancelled":""}</p>
              </li>)}</ul>
              {!byDay.get(day)?.length&&!loading&&<p className="pt-3 text-xs text-muted-foreground">Nothing scheduled.</p>}
            </section>)}
          </section>:<>
          <section aria-label="Calendar agenda" className="border border-border bg-card p-5 md:hidden">
            <h2 className="font-semibold">Agenda · {monthLabel}</h2>
            <ul className="mt-4 divide-y">{visibleItems.map(item=><li key={item.id} className="py-4">
              <Link {...itemDestination(item)} className="font-semibold text-primary underline">{item.title}</Link>
              <p className="mt-1 text-sm text-muted-foreground">{dateKeyInTimezone(item.startsAt,item.timezone)} · {formatTime(item.startsAt,item.timezone)} · {item.timezone} · {typeLabel(item)}{item.cancelled?" · Cancelled":""}</p>
            </li>)}</ul>
            {!visibleItems.length&&!loading&&<p className="mt-4 text-sm text-muted-foreground">No events match this calendar view.</p>}
          </section>
          <div className="hidden min-w-0 overflow-x-auto border border-border bg-card p-5 md:block">
            <div className="min-w-[28rem]">
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {WEEKDAYS.map((day) => <div key={day} className="py-1">{day}</div>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {cells.map((cell, index) =>
                cell ? (
                  <div
                    key={cell.key}
                    onClick={(event) => {
                      if (!(event.target instanceof Element) || !event.target.closest("a, button")) openDay(cell.key);
                    }}
                    onDragOver={(event) => {
                      if (isTeacher) event.preventDefault();
                    }}
                    onDrop={(event) => onDrop(event, cell.key)}
                    className={`min-h-24 cursor-pointer border p-1.5 text-xs ${
                      selectedDay === cell.key ? "border-primary ring-1 ring-primary" : "border-border"
                    }`}
                  >
                    <button
                      id={`calendar-day-${cell.key}`}
                      type="button"
                      onClick={() => openDay(cell.key)}
                      onKeyDown={event=>onCalendarDayKeyDown(event,cell.key)}
                      tabIndex={selectedDay===cell.key||(!selectedDay&&cell.day===1)?0:-1}
                      aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
                      className="block min-h-10 w-full text-left focus-visible:outline-2 focus-visible:outline-ring"
                      aria-label={`Select ${cell.key}`}
                    >
                      <span className="font-semibold">{cell.day}</span>
                    </button>
                    <span className="mt-1 flex flex-col gap-1">
                      {(byDay.get(cell.key) ?? []).map((item) => (
                        <Link
                          key={item.id}
                          {...itemDestination(item)}
                          draggable={isTeacher && item.source === "assessment"}
                          onDragStart={(event) => onDragStart(event, item)}
                          title={`${item.cancelled?"Cancelled · ":""}${typeLabel(item)} · ${item.title}`}
                          className={`block truncate border px-1 py-0.5 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring ${item.cancelled?"border-danger/50 bg-danger/10 text-danger":chipClass()} ${
                            isTeacher && item.source === "assessment" ? "cursor-grab" : ""
                          }`}
                        >
                          {item.cancelled?"Cancelled · ":""}{typeLabel(item)} · {item.title}
                        </Link>
                      ))}
                    </span>
                  </div>
                ) : (
                  <div key={`blank-${index}`} className="min-h-24 border border-transparent" />
                ),
              )}
            </div>
            </div>
          </div></>}

          <aside className="border border-border bg-card p-5">
            <h3 className="font-semibold">{selectedDay ? `Events on ${selectedDay}` : "Select a day"}</h3>
            {search.event&&selectedDay===search.date&&!loading&&!error&&!selectedItems.some(item=>item.id===search.event)&&<p role="alert" className="mt-3 text-sm">This event is unavailable on the requested date in your current calendar.</p>}
            {selectedDay && (
              <ul className="mt-3 space-y-2">
                {selectedItems.map((item) => (
                  <li key={item.id} className={`border p-3 text-sm ${search.event===item.id?"ring-2 ring-primary ":""}${item.cancelled ? "border-danger/50 bg-danger/10" : "border-border"}`}>
                    <p className="font-semibold">
                      <Link {...itemDestination(item)} className="text-primary underline">{item.title}</Link>
                      {item.cancelled && <span className="ml-2 border border-danger/50 bg-danger/10 px-1 py-0.5 text-3xs font-semibold uppercase tracking-wide text-danger">Cancelled</span>}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {typeLabel(item)} · {formatTime(item.startsAt, item.timezone)}
                      {item.endsAt ? ` – ${formatTime(item.endsAt, item.timezone)}` : ""}
                    </p>
                    {item.description && <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>}

                    {item.manageable && !manageMode && confirmCancelId !== item.id && (
                      <div className="mt-2 flex gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => startManage(item, "edit")} className="rounded-none">Edit</Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => startManage(item, "reschedule")} className="rounded-none">Move</Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => setConfirmCancelId(item.id)} className="rounded-none border-danger/50 text-danger hover:bg-danger/10">Cancel event</Button>
                      </div>
                    )}

                    {confirmCancelId === item.id && (
                      <div className="mt-2 border border-danger/50 bg-danger/10 p-2">
                        <p className="text-xs">Cancel "{item.title}"? Participants are notified and the change is audited.</p>
                        <div className="mt-2 flex gap-2">
                          <Button type="button" variant="destructive" size="sm" disabled={saving} onClick={() => submitCancel(item)} className="rounded-none">Confirm cancellation</Button>
                          <Button type="button" variant="outline" size="sm" onClick={() => setConfirmCancelId(null)} className="rounded-none">Keep event</Button>
                        </div>
                      </div>
                    )}

                    {manageMode?.id === item.id && manageMode.mode === "edit" && (
                      <div className="mt-2 space-y-2 border-t border-border pt-2">
                        <label className="block text-xs">
                          Title
                          <Input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} required minLength={3} maxLength={200} className="mt-1 rounded-none" />
                        </label>
                        <label className="block text-xs">
                          Description
                          <Textarea value={editDescription} onChange={(event) => setEditDescription(event.target.value)} maxLength={2000} rows={2} className="mt-1 min-h-20 rounded-none shadow-none" />
                        </label>
                      </div>
                    )}

                    {manageMode?.id === item.id && manageMode.mode === "reschedule" && (
                      <div className="mt-2 space-y-2 border-t border-border pt-2">
                        <Field label="Date" className="text-xs" required error={manageAttempted&&!moveDate?"Choose a date.":undefined}>
                          <Input type="date" value={moveDate} onChange={(event) => setMoveDate(event.target.value)}/>
                        </Field>
                        <div className="grid grid-cols-2 gap-3">
                          <Field label="Start" className="text-xs" required error={manageAttempted&&!moveStart?"Choose a start time.":undefined}>
                            <Input type="time" value={moveStart} onChange={(event) => setMoveStart(event.target.value)}/>
                          </Field>
                          <Field label="End (optional)" className="text-xs" error={manageAttempted&&moveEnd&&moveEnd<=moveStart?"Choose an end after the start.":undefined}>
                            <Input type="time" value={moveEnd} onChange={(event) => setMoveEnd(event.target.value)}/>
                          </Field>
                        </div>
                        <p className="text-xs text-muted-foreground">Times use {item.timezone}.</p>
                      </div>
                    )}

                    {manageMode?.id === item.id && (
                      <div className="mt-2 flex gap-2">
                        <Button type="button" variant="outline" disabled={saving} size="sm" onClick={() => submitManage(item)} className="rounded-none">{saving ? "Saving…" : "Save"}</Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => {setManageMode(null);setManageAttempted(false);}} className="rounded-none">Back</Button>
                      </div>
                    )}
                  </li>
                ))}
                {selectedItems.length === 0 && <li className="text-xs text-muted-foreground">Nothing scheduled.</li>}
              </ul>
            )}

            {isTeacher && (
              <p className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
                Drag a Due chip onto another day to move that assessment's due date.
              </p>
            )}
          </aside>
        </div>
        <Modal open={composerOpen} onClose={() => { if (!saving) setComposerOpen(false); }}
          label="Create calendar event" labelledBy="calendar-event-dialog-title" initialFocus={titleInput}
          className="max-w-4xl" busy={saving} dismissible={!saving}>
          <form noValidate onSubmit={event => { event.preventDefault(); submitEvent(); }}>
            <header className="flex items-start justify-between gap-5 border-b border-border px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Calendar</p>
                <h2 id="calendar-event-dialog-title" className="mt-1 font-serif text-2xl">Create event</h2>
                <p className="mt-1 text-sm text-muted-foreground">Add an event and invite people from your authorized address list.</p>
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label="Close event composer"
                disabled={saving} onClick={() => setComposerOpen(false)}><X aria-hidden="true" /></Button>
            </header>
            <div className="grid gap-6 p-6 md:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
              <div className="space-y-4">
                <Field label="Title" required error={eventAttempted && formTitle.trim().length < 3 ? "Enter a title with at least 3 characters." : undefined}>
                  <Input ref={titleInput} value={formTitle} onChange={event => setFormTitle(event.target.value)}
                    minLength={3} maxLength={200} placeholder="Add a title" />
                </Field>
                <Field label="Description">
                  <Textarea value={formDescription} onChange={event => setFormDescription(event.target.value)}
                    maxLength={2000} rows={4} placeholder="Add details" />
                </Field>
                <Field label="Date" required error={eventAttempted && !formDate ? "Choose an event date." : undefined}>
                  <Input type="date" value={formDate} onChange={event => setFormDate(event.target.value)} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Starts" required error={eventAttempted && !formStart ? "Choose a start time." : undefined}>
                    <Input type="time" value={formStart} onChange={event => setFormStart(event.target.value)} />
                  </Field>
                  <Field label="Ends" error={eventAttempted && formEnd && formEnd <= formStart ? "Choose an end after the start." : undefined}>
                    <Input type="time" value={formEnd} onChange={event => setFormEnd(event.target.value)} />
                  </Field>
                </div>
                <p className="text-xs text-muted-foreground">Times use {viewerTimezone}.</p>
              </div>
              <section aria-label="Event invitees" className="min-w-0 border-t border-border pt-4 md:border-l md:border-t-0 md:pl-6 md:pt-0">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-semibold">Invite people or groups</h3>
                  <span className="text-sm text-muted-foreground">{selectedInviteeCount} selected</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Only people in your role-scoped Global Address List (GAL) and permitted groups appear here. The server verifies selections again when you create the event.</p>
                <Field label="Search the Global Address List" className="mt-4">
                  <Input type="search" value={inviteSearch} onChange={event => setInviteSearch(event.target.value)}
                    placeholder="Search people or groups" />
                </Field>
                {(inviteContactsError || inviteGroupsError) && <div className="mt-3 space-y-1">
                  {inviteContactsError && <p role="alert" className="text-xs text-danger">{inviteContactsError}</p>}
                  {inviteGroupsError && <p role="alert" className="text-xs text-danger">{inviteGroupsError}</p>}
                </div>}
                {loading && <p role="status" className="mt-3 text-sm text-muted-foreground">Loading authorized contacts…</p>}
                {!loading && <div className="mt-3 max-h-64 space-y-4 overflow-y-auto border-y border-border py-3">
                  {visibleInviteGroups.length > 0 && <fieldset className="space-y-2">
                    <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Groups</legend>
                    {visibleInviteGroups.map(group => <label key={group.id} className="flex cursor-pointer items-start gap-3 py-1 text-sm">
                      <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={inviteGroupIds.includes(group.id)}
                        onChange={event => setInviteGroupIds(ids => event.target.checked
                          ? [...ids, group.id] : ids.filter(id => id !== group.id))} />
                      <span className="min-w-0"><span className="block font-medium">{group.title}</span>
                        <span className="block text-xs text-muted-foreground">{group.members.length} eligible {group.members.length === 1 ? "member" : "members"}</span></span>
                    </label>)}
                  </fieldset>}
                  <fieldset className="space-y-2">
                    <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">People</legend>
                    {visibleInvitePeople.map(contact => <label key={contact.personId} className="flex cursor-pointer items-start gap-3 py-1 text-sm">
                      <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={inviteePersonIds.includes(contact.personId)}
                        onChange={event => setInviteePersonIds(ids => event.target.checked
                          ? [...ids, contact.personId] : ids.filter(id => id !== contact.personId))} />
                      <span className="min-w-0"><span className="block font-medium">{contact.name}</span>
                        <span className="block text-xs text-muted-foreground">{contact.label}</span></span>
                    </label>)}
                    {!visibleInvitePeople.length && <p className="text-sm text-muted-foreground">No matching people in your authorized address list.</p>}
                  </fieldset>
                  {!visibleInviteGroups.length && !visibleInvitePeople.length && inviteSearch &&
                    <p className="text-sm text-muted-foreground">No matching people or groups.</p>}
                </div>}
                <div className="mt-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected guests</h4>
                  {selectedInviteeCount > 100 && <p role="alert" className="mt-2 text-xs text-danger">Choose no more than 100 people.</p>}
                  {inviteGroupIds.length > 50 && <p role="alert" className="mt-2 text-xs text-danger">Choose no more than 50 groups.</p>}
                  {!selectedInviteeCount ? <p className="mt-2 text-sm text-muted-foreground">No invitees selected.</p> : <ul className="mt-2 space-y-1 text-sm">
                    {inviteGroupIds.map(groupId => {
                      const group = inviteGroups.find(item => item.id === groupId);
                      return group ? <li key={group.id} className="flex justify-between gap-2"><span>{group.title}</span><span className="text-xs text-muted-foreground">Group</span></li> : null;
                    })}
                    {selectedInviteeNames.map(contact => <li key={contact.personId} className="flex justify-between gap-2"><span>{contact.name}</span><span className="text-xs text-muted-foreground">Person</span></li>)}
                  </ul>}
                </div>
              </section>
            </div>
            {error && <p role="alert" className="mx-6 mb-4 border border-danger/50 bg-danger/10 p-3 text-sm">{error}</p>}
            <MutationFeedback state={mutation} className="px-6 pb-4" pendingMessage="Creating event and sending invitations…" />
            <footer className="flex flex-wrap justify-end gap-3 border-t border-border px-6 py-4">
              <Button type="button" variant="outline" disabled={saving} onClick={() => setComposerOpen(false)}>Cancel</Button>
              <Button type="submit" size="lg" disabled={saving || selectedInviteeCount > 100 || inviteGroupIds.length > 50} className="min-w-40">
                {saving ? "Creating…" : "Create event"}
              </Button>
            </footer>
          </form>
        </Modal>
    </WorkspaceShell>
  );
}

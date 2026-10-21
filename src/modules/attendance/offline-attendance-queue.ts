export type OfflineAttendanceMark = {
  studentProfileId: string;
  programId: string;
  date: string;
  status: "present" | "absent" | "tardy";
  mutationId: string;
  note: string;
  expectedPreviousEventId?: string | null;
};

const queueLimit = 500;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function isSchoolDate(value: string): boolean {
  if (!datePattern.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isOfflineAttendanceMark(value: unknown): value is OfflineAttendanceMark {
  if (!value || typeof value !== "object") return false;
  const mark = value as Partial<OfflineAttendanceMark>;
  return typeof mark.studentProfileId === "string" && uuidPattern.test(mark.studentProfileId) &&
    typeof mark.programId === "string" && uuidPattern.test(mark.programId) &&
    typeof mark.date === "string" && isSchoolDate(mark.date) &&
    ["present", "absent", "tardy"].includes(mark.status ?? "") &&
    typeof mark.mutationId === "string" && uuidPattern.test(mark.mutationId) &&
    typeof mark.note === "string" &&
    (mark.expectedPreviousEventId === undefined || mark.expectedPreviousEventId === null ||
      (typeof mark.expectedPreviousEventId === "string" && uuidPattern.test(mark.expectedPreviousEventId)));
}

export function readOfflineAttendanceQueue(storage: Pick<Storage, "getItem">): {
  marks: OfflineAttendanceMark[];
  error: string | null;
} {
  let raw: string | null;
  try {
    raw = storage.getItem("can-os:attendance:pending:v2");
  } catch {
    return { marks: [], error: "Offline attendance storage is unavailable. Pending entries were not changed." };
  }
  if (raw === null) return { marks: [], error: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { marks: [], error: "The offline attendance queue is unreadable. Its contents were preserved." };
  }
  if (!Array.isArray(parsed) || parsed.length > queueLimit || !parsed.every(isOfflineAttendanceMark)) {
    return { marks: [], error: "The offline attendance queue contains invalid or too many entries. Its contents were preserved." };
  }
  return { marks: parsed, error: null };
}

export function writeOfflineAttendanceQueue(
  storage: Pick<Storage, "setItem">,
  marks: OfflineAttendanceMark[],
): void {
  if (marks.length > queueLimit || !marks.every(isOfflineAttendanceMark)) {
    throw new Error("Offline attendance queue cannot store invalid or more than 500 entries.");
  }
  try {
    storage.setItem("can-os:attendance:pending:v2", JSON.stringify(marks));
  } catch {
    throw new Error("Offline attendance storage is unavailable. The entry was not saved.");
  }
}

export function enqueueOfflineAttendanceMark(
  storage: Pick<Storage, "getItem" | "setItem">,
  mark: OfflineAttendanceMark,
): OfflineAttendanceMark[] {
  const current = readOfflineAttendanceQueue(storage);
  if (current.error) throw new Error(current.error);
  const existing = current.marks.findIndex(entry => entry.mutationId === mark.mutationId);
  const next = [...current.marks];
  if (existing >= 0) next[existing] = mark;
  else next.push(mark);
  writeOfflineAttendanceQueue(storage, next);
  return next;
}

export function removeOfflineAttendanceMarks(
  storage: Pick<Storage, "getItem" | "setItem">,
  mutationIds: Set<string>,
): OfflineAttendanceMark[] {
  const current = readOfflineAttendanceQueue(storage);
  if (current.error) throw new Error(current.error);
  const remaining = current.marks.filter(mark => !mutationIds.has(mark.mutationId));
  writeOfflineAttendanceQueue(storage, remaining);
  return remaining;
}

export function replaceOfflineAttendanceMark(
  storage: Pick<Storage, "getItem" | "setItem">,
  previousMutationId: string,
  replacement: OfflineAttendanceMark,
): OfflineAttendanceMark[] {
  const current = readOfflineAttendanceQueue(storage);
  if (current.error) throw new Error(current.error);
  const index = current.marks.findIndex(mark => mark.mutationId === previousMutationId);
  if (index < 0) throw new Error("Offline attendance entry changed. Refresh the queue before retrying.");
  const next = [...current.marks];
  next[index] = replacement;
  writeOfflineAttendanceQueue(storage, next);
  return next;
}

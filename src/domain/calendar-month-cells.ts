export type CalendarMonthCell = { key: string; day: number } | null;

/** Calendar month slots use JS Sunday-first indexing, matching weekday labels.
 * Keys are local date-only strings and do not represent UTC instants.
 */
export function calendarMonthCells(year: number, month: number): CalendarMonthCell[] {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return [];
  const first = new Date(year, month - 1, 1);
  const days = new Date(year, month, 0).getDate();
  const slots: CalendarMonthCell[] = Array.from({length:first.getDay()},()=>null);
  for (let day=1;day<=days;day++) {
    slots.push({key:`${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`,day});
  }
  return slots;
}

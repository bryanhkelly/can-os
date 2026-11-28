import type { DragEvent, KeyboardEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import type { CalendarFeedItem } from "@/modules/calendar/calendar.functions";
import { dateKeyInTimezone } from "@/modules/calendar/timezone";
import { calendarEventDetailsDestination } from "@/domain/calendar-view";
import { calendarMonthCells } from "@/domain/calendar-month-cells";
import { WEEKDAY_ABBREVIATIONS } from "@/domain/weekdays";
import { typeLabel, chipClass } from "./calendar-presentation";

type Selection = NonNullable<Parameters<typeof calendarEventDetailsDestination>[2]>;

/** Reusable month grid; owner keeps focus movement and assessment mutations. */
export function CalendarMonthGrid({
  year, month, byDay, selection, selectedDay, canDragDeadlines,
  onSelectDay, onDayKeyDown, onDragStart, onDrop,
}: {
  year: number;
  month: number;
  byDay: ReadonlyMap<string, readonly CalendarFeedItem[]>;
  selection: Selection;
  selectedDay: string | null;
  canDragDeadlines: boolean;
  onSelectDay: (day: string) => void;
  onDayKeyDown: (event: KeyboardEvent<HTMLButtonElement>, day: string) => void;
  onDragStart: (event: DragEvent<HTMLAnchorElement>, item: CalendarFeedItem) => void;
  onDrop: (event: DragEvent<HTMLDivElement>, day: string) => void | Promise<unknown>;
}) {
  return <div className="hidden min-w-0 overflow-x-auto border border-border bg-card p-5 md:block">
            <div className="min-w-[28rem]">
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {WEEKDAY_ABBREVIATIONS.map((day) => <div key={day} className="py-1">{day}</div>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {calendarMonthCells(year, month).map((cell, index) =>
                cell ? (
                  <div
                    key={cell.key}
                    onClick={(event) => {
                      if (!(event.target instanceof Element) || !event.target.closest("a, button")) onSelectDay(cell.key);
                    }}
                    onDragOver={(event) => {
                      if (canDragDeadlines) event.preventDefault();
                    }}
                    onDrop={(event) => onDrop(event, cell.key)}
                    className={`min-h-24 cursor-pointer border p-1.5 text-xs ${
                      selectedDay === cell.key ? "border-primary ring-1 ring-primary" : "border-border"
                    }`}
                  >
                    <Button variant="ghost" size="sm"
                      id={`calendar-day-${cell.key}`}
                      type="button"
                      onClick={() => onSelectDay(cell.key)}
                      onKeyDown={event=>onDayKeyDown(event,cell.key)}
                      tabIndex={selectedDay===cell.key||(!selectedDay&&cell.day===1)?0:-1}
                      aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
                      className="block h-auto min-h-10 w-full text-left"
                      aria-label={`Select ${cell.key}`}
                    >
                      <span className="font-semibold">{cell.day}</span>
                    </Button>
                    <span className="mt-1 flex flex-col gap-1">
                      {(byDay.get(cell.key) ?? []).map((item) => (
                        <Link
                          key={item.id}
                          {...calendarEventDetailsDestination(item.id,dateKeyInTimezone(item.startsAt,item.timezone),selection)}
                          draggable={canDragDeadlines && item.source === "assessment"}
                          onDragStart={(event) => onDragStart(event, item)}
                          title={`${item.cancelled?"Cancelled · ":""}${typeLabel(item)} · ${item.title}`}
                          className={`block truncate border px-1 py-0.5 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring ${item.cancelled?"border-danger/50 bg-danger/10 text-danger":chipClass()} ${
                            canDragDeadlines && item.source === "assessment" ? "cursor-grab" : ""
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
          </div>;
}

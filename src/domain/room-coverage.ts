import { z } from "zod";
import { isValidDateOnly, addCalendarDays } from "@/modules/calendar/timezone";
import type { AccessContext } from "./access-context";
import { AuthorizationError } from "./command-context";
import { hasRegistrarAuthority } from "./school-roles";

const uuid = z.string().uuid();
const date = z.string().refine(isValidDateOnly, "Choose a valid school-local date");
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const roomCoverageScopeSchema = z.object({ siteId: uuid.optional() }).strict();
export const createRoomAtSiteSchema = z.object({
  siteId: uuid, roomId: uuid, name: z.string().trim().min(2).max(120),
  capacity: z.number().int().min(1).max(1000),
}).strict();
export const saveRoomCoverageSchema = z.object({
  siteId: uuid, id: uuid, expectedRevision: z.number().int().positive().nullable(),
  roomId: uuid, primaryPersonId: uuid, backupPersonId: uuid.nullable(),
  startsOn: date, endsOn: date, weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  startsAtLocal: time, endsAtLocal: time, sectionIds: z.array(uuid).max(250),
}).strict().superRefine((value, ctx) => {
  if (isValidDateOnly(value.startsOn) && isValidDateOnly(value.endsOn) &&
      (value.startsOn > value.endsOn || value.endsOn > addCalendarDays(value.startsOn, 90)))
    ctx.addIssue({ code: "custom", path: ["endsOn"], message: "Coverage must end within 90 days of its start" });
  if (value.startsAtLocal >= value.endsAtLocal)
    ctx.addIssue({ code: "custom", path: ["endsAtLocal"], message: "Coverage must end after it starts" });
  if (value.primaryPersonId === value.backupPersonId)
    ctx.addIssue({ code: "custom", path: ["backupPersonId"], message: "Choose a different backup adult" });
  if (new Set(value.weekdays).size !== value.weekdays.length || new Set(value.sectionIds).size !== value.sectionIds.length)
    ctx.addIssue({ code: "custom", message: "Coverage days and classes must be unique" });
});
export type RoomCoverageWindow = {
  startsOn: string; endsOn: string; weekdays: readonly number[];
  startsAtLocal: string; endsAtLocal: string;
};
export function roomCoverageOccurs(plan: RoomCoverageWindow, date: string,
  startsAtLocal = plan.startsAtLocal, endsAtLocal = plan.endsAtLocal): boolean {
  const clock = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
  if (!clock.test(startsAtLocal) || !clock.test(endsAtLocal)) return false;
  const start = startsAtLocal.length === 5 ? startsAtLocal + ":00" : startsAtLocal;
  const end = endsAtLocal.length === 5 ? endsAtLocal + ":00" : endsAtLocal;
  return isValidDateOnly(date) && date >= plan.startsOn && date <= plan.endsOn &&
    plan.weekdays.includes(new Date(date + "T12:00:00Z").getUTCDay()) &&
    start >= plan.startsAtLocal + ":00" &&
    end <= plan.endsAtLocal + ":00" && start < end;
}
export function roomCoverageOverlaps(a: RoomCoverageWindow, b: RoomCoverageWindow): boolean {
  if (a.startsAtLocal >= b.endsAtLocal || b.startsAtLocal >= a.endsAtLocal) return false;
  const end = a.endsOn < b.endsOn ? a.endsOn : b.endsOn;
  for (let day = a.startsOn > b.startsOn ? a.startsOn : b.startsOn; day <= end; day = addCalendarDays(day, 1)) {
    if (roomCoverageOccurs(a, day) && roomCoverageOccurs(b, day)) return true;
  }
  return false;
}
export function assertRoomCoverageManager(actor: AccessContext, site: { id: string; organizationId: string }) {
  if (!actor.actorPersonId || actor.sessionAccountId || !hasRegistrarAuthority(actor.role) ||
      !actor.capabilities.has("admin.manage") ||
      !actor.scope.organizationIds?.includes(site.organizationId) || !actor.scope.siteIds?.includes(site.id) ||
      (actor.grantSiteId !== null && actor.grantSiteId !== site.id))
    throw new AuthorizationError("original school administrator for this exact Site");
}

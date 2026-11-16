import { z } from "zod";
import { AuthorizationError } from "./command-context";

/**
 * A Class Session agenda is an ordered pointer list into ONE published Course
 * version. It is not a Course fork, an assignment/assessment release, a grade,
 * an attendance mark, or a learner-progress record.
 *
 * "watch" and "practice" intentionally point to the canonical LESSON, not to
 * a specific recorded teacher. Each learner's independently authorized track
 * selection resolves the presentation/practice material for that same lesson.
 */
export const classSessionAgendaItemSchema = z.object({
  kind: z.enum(["study", "watch", "practice", "assignment", "assessment"]),
  referenceId: z.string().uuid(),
}).strict();
export const classSessionAgendaItemsSchema = z.array(
  classSessionAgendaItemSchema,
).min(1).max(24).superRefine((items, ctx) => {
  const seen = new Set<string>();
  for (const [index, item] of items.entries()) {
    const key = item.kind + ":" + item.referenceId;
    if (seen.has(key)) ctx.addIssue({
      code: "custom", path: [index], message: "Duplicate Session activity",
    });
    seen.add(key);
  }
});
export type ClassSessionAgendaItem = z.infer<typeof classSessionAgendaItemSchema>;

export type ClassSessionAgendaInventory = {
  lessons: ReadonlySet<string>;
  assignments: ReadonlySet<string>;
  assessments: ReadonlySet<string>;
};

/** Server must populate inventory from the Class's immutable Course version. */
export function assertClassSessionAgendaReferences(
  items: readonly ClassSessionAgendaItem[],
  inventory: ClassSessionAgendaInventory,
): void {
  for (const item of items) {
    const allowed = item.kind === "assignment"
      ? inventory.assignments
      : item.kind === "assessment" ? inventory.assessments : inventory.lessons;
    if (!allowed.has(item.referenceId)) {
      throw new AuthorizationError(
        "Session activity must reference approved content in this Course version",
      );
    }
  }
}

/** Once a classroom starts, a plan is historical evidence, not editable state. */
export function canPublishClassSessionAgenda(input: {
  planState: "scheduled" | "started" | "cancelled";
  startsAt: Date;
  now: Date;
}): boolean {
  return input.planState === "scheduled" &&
    Number.isFinite(input.startsAt.getTime()) &&
    Number.isFinite(input.now.getTime()) &&
    input.now.getTime() < input.startsAt.getTime();
}

export function nextClassSessionAgendaRevision(
  previous: {revisionNo: number; requestId: string; items: readonly ClassSessionAgendaItem[]} | null,
  requestId: string,
  items: readonly ClassSessionAgendaItem[],
): {revisionNo: number; duplicate: boolean} {
  if (previous?.requestId === requestId) {
    if (JSON.stringify(previous.items) !== JSON.stringify(items))
      throw new AuthorizationError("Conflicting Session agenda retry");
    return {revisionNo: previous.revisionNo, duplicate: true};
  }
  return {revisionNo: (previous?.revisionNo ?? 0) + 1, duplicate: false};
}

/** Reject stale writes, even if the content happened to be unchanged.
 * Retry deduplication is checked separately BEFORE this assertion. */
export function assertClassSessionAgendaExpectedRevision(
  expectedRevisionNo:number,currentRevisionNo:number,
):void{
  if(!Number.isInteger(expectedRevisionNo)||expectedRevisionNo<0||
     expectedRevisionNo!==currentRevisionNo)
    throw new AuthorizationError(
      "Class Session plan changed in another browser. Reload its latest revision before publishing",
    );
}

/** A rollout may expose optional planning before enforcing it for NEW Sessions.
 * Empty mandatoryFrom disables enforcement, avoiding retroactive breakage.
 * Once a UTC activation cutoff is supplied, only newly created Sessions are
 * gated. This never changes existing Session identities or historical data. */
export function requiresClassSessionAgenda(input:{
  featureEnabled:boolean;
  mandatoryFrom:string|undefined;
  sessionCreatedAt:Date;
}):boolean{
  if(!input.featureEnabled||!input.mandatoryFrom)return false;
  const value=input.mandatoryFrom;
  if(!/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?Z$/.test(value)||
     !Number.isFinite(Date.parse(value)))
    throw new Error("CAN_WS4_AGENDA_REQUIRED_FROM must be a valid UTC ISO timestamp");
  if(!Number.isFinite(input.sessionCreatedAt.getTime()))
    throw new Error("Class Session createdAt must be an actual timestamp");
  return input.sessionCreatedAt.getTime()>=Date.parse(value);
}

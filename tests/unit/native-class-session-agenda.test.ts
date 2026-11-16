import { describe, expect, it } from "vitest";
import {
  assertClassSessionAgendaReferences, canPublishClassSessionAgenda,
  classSessionAgendaItemsSchema, nextClassSessionAgendaRevision,
} from "../../src/domain/native-class-session-agenda";

const lesson = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const assessment = "33333333-3333-4333-8333-333333333333";
const items = [{kind:"watch" as const, referenceId:lesson},
  {kind:"practice" as const, referenceId:lesson},
  {kind:"assessment" as const, referenceId:assessment}];

describe("WS4 immutable Course-linked Session agenda", () => {
  it("keeps study/watch/practice separate without pinning a recorded teacher", () => {
    expect(classSessionAgendaItemsSchema.parse(items)).toEqual(items);
    expect(items.every(item=>!("trackVersionId" in item))).toBe(true);
    expect(()=>assertClassSessionAgendaReferences(items, {
      lessons:new Set([lesson]),assignments:new Set(),assessments:new Set([assessment]),
    })).not.toThrow();
  });
  it("denies a different Course lesson, assignment or unpublished assessment", () => {
    expect(()=>assertClassSessionAgendaReferences(
      [{kind:"watch",referenceId:other}],{
        lessons:new Set([lesson]),assignments:new Set(),assessments:new Set([assessment]),
      })).toThrow();
    expect(()=>assertClassSessionAgendaReferences(
      [{kind:"assessment",referenceId:other}],{
        lessons:new Set([lesson]),assignments:new Set(),assessments:new Set([assessment]),
      })).toThrow();
  });
  it("rejects duplicate activities, fabricated fields and empty agenda", () => {
    expect(classSessionAgendaItemsSchema.safeParse([items[0],items[0]]).success).toBe(false);
    expect(classSessionAgendaItemsSchema.safeParse([]).success).toBe(false);
    expect(classSessionAgendaItemsSchema.safeParse([{...items[0],grade:"A"}]).success).toBe(false);
    expect(classSessionAgendaItemsSchema.safeParse(Array.from({length:25},()=>items[0])).success).toBe(false);
  });
  it("blocks revision after start, cancellation, and at/after the scheduled time", () => {
    const startsAt = new Date("2026-12-01T19:00:00Z");
    const before = new Date("2026-12-01T18:59:59Z");
    expect(canPublishClassSessionAgenda({planState:"scheduled",startsAt,now:before})).toBe(true);
    for (const state of ["started","cancelled"] as const)
      expect(canPublishClassSessionAgenda({planState:state,startsAt,now:before})).toBe(false);
    expect(canPublishClassSessionAgenda({planState:"scheduled",startsAt,now:startsAt})).toBe(false);
  });
  it("allows append-only revision but denies a conflicting idempotency replay", () => {
    const first = nextClassSessionAgendaRevision(null,"req-1",items);
    expect(first).toEqual({revisionNo:1,duplicate:false});
    const previous = {revisionNo:1,requestId:"req-1",items};
    expect(nextClassSessionAgendaRevision(previous,"req-1",items)).toEqual({
      revisionNo:1,duplicate:true,
    });
    expect(()=>nextClassSessionAgendaRevision(previous,"req-1",[items[0]])).toThrow();
    expect(nextClassSessionAgendaRevision(previous,"req-2",[items[0]])).toEqual({
      revisionNo:2,duplicate:false,
    });
  });
});

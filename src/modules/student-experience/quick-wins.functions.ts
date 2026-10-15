import { assertSyntheticMutation } from "./demo-write-gate";
import { createServerFn } from "@tanstack/react-start";
import { and, eq, desc } from "drizzle-orm";

const PERSON = "f1000000-0000-4000-8000-000000000005";
const STUDENT = "f1000000-0000-4000-8000-000000000007";
const SITE = "f1000000-0000-4000-8000-000000000003";
const ORG = "f1000000-0000-4000-8000-000000000002";
const PROGRAM = "f1000000-0000-4000-8000-000000000004";

export const getQuickWinActions = createServerFn({ method: "GET" }).handler(async () => {
  if (!process.env.DATABASE_URL) return { connected: false as const, actions: [] };
  const [{ db }, { actions }] = await Promise.all([
    import("@/db/client"), import("@/db/schema"),
  ]);
  const rows = await db.select({
    id: actions.id, title: actions.title, description: actions.description,
    status: actions.status, priority: actions.priority, dueAt: actions.dueAt,
    metadata: actions.metadata, type: actions.type,
  }).from(actions).where(and(
    eq(actions.ownerPersonId, PERSON),
    eq(actions.siteId, SITE),
  )).orderBy(desc(actions.createdAt)).limit(100);
  return { connected: true as const, actions: rows.filter(row => row.metadata.synthetic === true).map(row => ({ ...row, metadata: { source: typeof row.metadata.source === "string" ? row.metadata.source : row.type }, dueAt: row.dueAt?.toISOString() ?? null })) };
});

export const finishQuickWinAction = createServerFn({ method: "POST" })
  .validator((value: { actionId: string }) => value)
  .handler(async ({ data }) => {
  assertSyntheticMutation("student");
    if (!process.env.DATABASE_URL) throw new Error("Neon is not configured");
    const [{ db }, { actions }] = await Promise.all([
      import("@/db/client"), import("@/db/schema"),
    ]);
    const [result] = await db.update(actions).set({
      status: "resolved", resolvedAt: new Date(), resolutionNote: "Completed in synthetic student experience",
      updatedAt: new Date(),
    }).where(and(
      eq(actions.id, data.actionId),
      eq(actions.ownerPersonId, PERSON),
      eq(actions.siteId, SITE),
      eq(actions.status, "open"),
    )).returning({ id: actions.id });
    if (!result) throw new Error("Synthetic Action not found or already completed");
    return { id: result.id };
  });

export const requestQuickWinHelp = createServerFn({ method: "POST" })
  .validator((value: { message: string }) => value)
  .handler(async ({ data }) => {
  assertSyntheticMutation("student");
    if (!process.env.DATABASE_URL) throw new Error("Neon is not configured");
    const message = data.message.trim();
    if (message.length < 3 || message.length > 1000) {
      throw new Error("Help request must be between 3 and 1000 characters");
    }
    const [{ db }, { actions }] = await Promise.all([
      import("@/db/client"), import("@/db/schema"),
    ]);
    const [result] = await db.insert(actions).values({
      type: "student_support_request", title: "Student asked for help",
      description: message, ownerPersonId: PERSON,
      organizationId: ORG, siteId: SITE, programId: PROGRAM,
      subjectType: "student_profile", subjectId: STUDENT,
      status: "open", priority: "normal",
      metadata: { synthetic: true, fixture: "student-quick-wins", kind: "message", source: "Student support" },
    }).returning({ id: actions.id });
    if (!result) throw new Error("Help request could not be saved");
    return { id: result.id };
  });

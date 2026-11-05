import { getTableName, type SQL, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listMyThreads, listThreadContacts, startThread, startThreadInputSchema } from "@/modules/communication/messages.functions";
import { roleCapabilities } from "@/domain/access-context";
import { AuthorizationError } from "@/domain/command-context";

const state = vi.hoisted(() => ({
  role: "registrar", select: vi.fn(), transaction: vi.fn(),
  capabilities: new Set<string>(["communication.send"]),
  rows: {} as Record<string, unknown[]>,
  filters: [] as { table: string; predicate: SQL }[],
  academicActive: 0,
  academicMaxActive: 0,
  academicActorResolutions: 0,
  deniedAcademicIds: new Set<string>(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ validator() { return this; }, handler(callback: unknown) { return callback; } }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: vi.fn(), setResponseHeader: vi.fn() }));
vi.mock("@/modules/identity/command-context.server", () => ({
  getCommandContext: async () => ({
    role: state.role, actorPersonId: "actor", accountId: "account", grantId: "grant",
    grantSiteId: "school-site", capabilities: state.capabilities,
    scope: { organizationIds: ["school-org"], siteIds: ["school-site"], programIds: ["school-program"] },
  }),
}));
vi.mock("@/db/client", () => ({ db: { select: state.select, selectDistinct: state.select, transaction: state.transaction } }));
vi.mock("@/platform/mutation", () => ({ emitEvent: vi.fn(), writeAudit: vi.fn() }));
vi.mock("@/modules/operations/site-section-facilitators.server", () => ({
  activeFacilitatorSectionIds: vi.fn(async () => ["assigned-section"]),
}));
vi.mock("@/modules/learning/academic-conversation-access.server", () => ({
  resolveAcademicConversationActor: vi.fn(async () => {
    state.academicActorResolutions += 1;
    return { actorPersonId: "actor" };
  }),
  academicConversationHref: vi.fn(async (thread: { contextId: string | null }, _tx?: unknown, actor?: unknown) => {
    if (!actor) state.academicActorResolutions += 1;
    state.academicActive += 1;
    state.academicMaxActive = Math.max(state.academicMaxActive, state.academicActive);
    await new Promise(resolve => setTimeout(resolve, 10));
    state.academicActive -= 1;
    if (thread.contextId && state.deniedAcademicIds.has(thread.contextId)) throw new AuthorizationError("revoked academic access");
    return "/student/assignments";
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.role = "registrar";
  state.capabilities = new Set(["communication.send"]);
  state.filters = [];
  state.academicActive = 0;
  state.academicMaxActive = 0;
  state.academicActorResolutions = 0;
  state.deniedAcademicIds = new Set();
  state.rows = {
    enrollments: [{ personId: "student" }],
    guardian_relationships: [{ personId: "guardian" }],
    account_person_grants: [{ personId: "teacher", role: "teacher" }, { personId: "actor", role: "registrar" }],
    people: [
      { id: "student", legalFirstName: "Student", legalLastName: "Example", preferredName: null },
      { id: "guardian", legalFirstName: "Guardian", legalLastName: "Example", preferredName: null },
      { id: "teacher", legalFirstName: "Teacher", legalLastName: "Example", preferredName: null },
      { id: "actor", legalFirstName: "Actor", legalLastName: "Example", preferredName: null },
    ],
  };
  state.select.mockImplementation(() => ({
    table: "",
    from(table: Table) { this.table = getTableName(table); return this; },
    innerJoin() { return this; },
    where(predicate: SQL) { state.filters.push({ table: this.table, predicate }); return this; },
    orderBy() { return this; },
    then(resolve: (value: unknown[]) => unknown, reject: (cause: unknown) => unknown) {
      return Promise.resolve(state.rows[this.table] ?? []).then(resolve, reject);
    },
  }));
});

describe("school administration messaging contacts", () => {
  it("revalidates academic conversations in bounded parallel batches", async () => {
    state.rows.communication_participants = [1, 2, 3, 4, 5].map(index => ({
      id: `thread-${index}`, subject: `Conversation ${index}`, contextType: "assessment",
      contextId: `assessment-${index}`, metadata: { kind: "academic_conversation", studentProfileId: `student-${index}` },
      lastMessageAt: new Date(`2026-11-0${index}T12:00:00Z`), createdAt: new Date(`2026-11-0${index}T12:00:00Z`),
    }));
    state.rows.communication_messages = state.rows.communication_participants.map((thread, index) => ({
      threadId: (thread as { id: string }).id, body: `Message ${index + 1}`, sentAt: new Date(`2026-11-0${index + 1}T12:00:00Z`),
    }));
    state.deniedAcademicIds.add("assessment-3");

    const result = await listMyThreads();

    expect(result.threads.map(thread => thread.id)).toEqual(["thread-5", "thread-4", "thread-2", "thread-1"]);
    expect(state.academicActorResolutions).toBe(1);
    expect(state.academicMaxActive).toBeGreaterThan(1);
    expect(state.academicMaxActive).toBeLessThanOrEqual(4);
  });

  it("accepts a one-character subject but rejects a blank subject", () => {
    const message = { recipientPersonId: "00000000-0000-4000-8000-000000000001", body: "Hello" };
    expect(startThreadInputSchema.parse({ ...message, subject: "t" }).subject).toBe("t");
    expect(() => startThreadInputSchema.parse({ ...message, subject: " " })).toThrow("Subject must not be empty");
  });

  it.each(["registrar", "site_admin"])("provides scoped students, verified guardians and staff for %s", async role => {
    state.role = role;
    const result = await listThreadContacts();
    expect(result.contacts.map(contact => contact.personId).sort()).toEqual(["guardian", "student", "teacher"]);
    const dialect = new PgDialect();
    const enrollment = dialect.sqlToQuery(state.filters.find(filter => filter.table === "enrollments")!.predicate);
    expect(enrollment.params).toEqual(expect.arrayContaining(["program", "active", "school-program", "school-site"]));
    const guardian = dialect.sqlToQuery(state.filters.find(filter => filter.table === "guardian_relationships")!.predicate);
    expect(guardian.sql).toContain("can_manage_enrollment");
    expect(guardian.sql).toContain("'verified'");
    expect(guardian.params).toContain("student");
    const staff = dialect.sqlToQuery(state.filters.find(filter => filter.table === "account_person_grants")!.predicate);
    expect(staff.params).toEqual(expect.arrayContaining(["school-program", "school-site", "teacher", true]));
    expect(staff.sql).toContain('"account_person_grants"."site_id"');
  });
  it.each(["registrar", "site_admin"])("rejects an arbitrary recipient before writes for %s", async role => {
    state.role = role;
    await expect(startThread({ data: { recipientPersonId: "unrelated-person", subject: "Hello", body: "Hello" } }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.transaction).not.toHaveBeenCalled();
  });
  it("rechecks current relationships rather than trusting a previous lookup", async () => {
    expect((await listThreadContacts()).contacts.some(contact => contact.personId === "student")).toBe(true);
    state.rows.enrollments = [];
    await expect(startThread({ data: { recipientPersonId: "student", subject: "Hello", body: "Hello" } }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.transaction).not.toHaveBeenCalled();
  });

  it.each(["site_staff", "site_leader", "room_facilitator"] as const)(
    "limits %s contacts to current-site leaders and assigned teachers", async role => {
      state.role = role;
      state.capabilities = new Set(roleCapabilities[role]);
      state.rows.account_person_grants = [
        { personId: "leader", role: "site_leader" },
        { personId: "teacher", role: "teacher" },
        { personId: "actor", role },
      ];
      state.rows.section_teachers = [{ personId: "teacher", sectionTitle: "Room 1", sectionId: "assigned-section" }];
      state.rows.people = [
        ...state.rows.people as { id: string; legalFirstName: string; legalLastName: string; preferredName: null }[],
        { id: "leader", legalFirstName: "Site", legalLastName: "Leader", preferredName: null },
      ];

      const result = await listThreadContacts();

      expect(roleCapabilities[role]).toContain("communication.send");
      expect(result.contacts.map(contact => contact.personId).sort()).toEqual(["leader", "teacher"]);
      const dialect = new PgDialect();
      const grants = dialect.sqlToQuery(state.filters.find(filter => filter.table === "account_person_grants")!.predicate);
      expect(grants.params).toEqual(expect.arrayContaining(["registrar", "site_admin", "site_leader", "school-program", "school-site", true]));
      const assignments = dialect.sqlToQuery(state.filters.find(filter => filter.table === "section_teachers")!.predicate);
      expect(assignments.params).toEqual(expect.arrayContaining(["school-site", "school-program", "teacher", true]));
      if (role === "room_facilitator") expect(assignments.params).toContain("assigned-section");
    },
  );

  it("rejects an onsite message recipient outside the current relationship set", async () => {
    state.role = "site_staff";
    state.capabilities = new Set(roleCapabilities.site_staff);
    state.rows.account_person_grants = [{ personId: "leader", role: "site_leader" }];
    state.rows.people = [
      ...state.rows.people as { id: string; legalFirstName: string; legalLastName: string; preferredName: null }[],
      { id: "leader", legalFirstName: "Site", legalLastName: "Leader", preferredName: null },
    ];

    await expect(startThread({ data: {
      recipientPersonId: "00000000-0000-4000-8000-000000000001", subject: "Hello", body: "Hello",
    } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.transaction).not.toHaveBeenCalled();
  });

  it("uses the existing transactional send path for a verified assigned teacher", async () => {
    state.role = "site_staff";
    state.capabilities = new Set(roleCapabilities.site_staff);
    state.rows.account_person_grants = [{ personId: "teacher", role: "teacher" }];
    state.rows.section_teachers = [{ personId: "teacher", sectionTitle: "Room 1", sectionId: "section" }];
    state.transaction.mockImplementation(async (operation: (tx: unknown) => unknown) => {
      const tx = {
        insert(table: Table) {
          const tableName = getTableName(table);
          return {
            values() {
              return {
                returning: async () => tableName === "communication_threads"
                  ? [{ id: "thread" }] : [{ id: "message" }],
                then: (resolve: (value: undefined) => unknown) => Promise.resolve(undefined).then(resolve),
              };
            },
          };
        },
      };
      return operation(tx);
    });

    await expect(startThread({ data: {
      recipientPersonId: "teacher", subject: "Classroom update", body: "The room is ready.",
    } })).resolves.toEqual({ threadId: "thread" });
    expect(state.transaction).toHaveBeenCalledOnce();
  });
});

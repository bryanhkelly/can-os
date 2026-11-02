import { getTableName, type Table } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getThread, listThreadContacts } from "@/modules/communication/messages.functions";
import { searchWorkspace } from "@/modules/search/global-search.functions";
import { renderAcademicCredential } from "@/modules/learning/academic-credential-delivery.functions";

const state = vi.hoisted(() => ({
  role: "student", rows: {} as Record<string, unknown[]>,
  select: vi.fn(),
  pdf: vi.fn(() => new Uint8Array([37, 80, 68, 70])),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ validator() { return this; }, handler(callback: unknown) { return callback; } }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: vi.fn(), setResponseHeader: vi.fn() }));
vi.mock("@/modules/identity/command-context.server", () => ({
  getCommandContext: async () => ({ role: state.role, actorPersonId: "actor",
    capabilities: new Set(["enrollment:manage"]),
    scope: { organizationIds: ["issuer"], siteIds: ["site"], programIds: ["program"] } }),
}));
vi.mock("@/modules/identity/actors.server", () => ({
  requireActor: async () => ({ role: state.role, actorPersonId: "actor",
    scope: { siteIds: ["site"], programIds: ["program"] } }),
  actorSiteIds: () => ["site"],
}));
vi.mock("@/domain/academic-document-pdf.server", () => ({ academicDocumentPdf: state.pdf }));
vi.mock("@/modules/learning/academic-credential-freshness.server", () => ({
  assertDiplomaFreshForAuthorizedRelease: vi.fn(),
  assertOfficialTranscriptFreshForAuthorizedRelease: vi.fn(),
}));
vi.mock("@/db/client", () => {
  const db = {
    select: state.select,
    transaction: async <T>(callback: (tx: unknown) => Promise<T>) => callback(db),
  };
  return { db };
});
vi.mock("@neondatabase/serverless", () => ({ Pool: class {} }));
vi.mock("drizzle-orm/neon-serverless", () => ({ drizzle: () => ({ select: state.select }) }));

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://mock.invalid/person-name-test");
  state.role = "student";
  state.rows = {};
  vi.clearAllMocks();
  state.select.mockImplementation(() => ({
    table: "",
    from(table: Table) { this.table = getTableName(table); return this; },
    innerJoin() { return this; }, where() { return this; }, orderBy() { return this; },
    $dynamic() { return this; }, limit() { return this; },
    then(resolve: (rows: unknown[]) => unknown, reject: (reason: unknown) => unknown) {
      return Promise.resolve(state.rows[this.table] ?? []).then(resolve, reject);
    },
  }));
});
afterEach(() => vi.unstubAllEnvs());

describe("person-name projections", () => {
  it.each([
    { preferredName: " Jo  ", legalFirstName: "Jordan", legalLastName: " Test ", display: "Jo Test", short: "Jo" },
    { preferredName: " \t ", legalFirstName: " Jordan ", legalLastName: "Test", display: "Jordan Test", short: "Jordan" },
    { preferredName: null, legalFirstName: "Jordan", legalLastName: "Test", display: "Jordan Test", short: "Jordan" },
    { preferredName: null, legalFirstName: "", legalLastName: "", display: "Unknown person", short: "Unknown person" },
  ])("shares display names between messaging and search: $display", async person => {
    state.rows.enrollments = [{ personId: "contact", sectionTitle: "English" }];
    state.rows.people = [{ id: "contact", ...person }];
    expect((await listThreadContacts()).contacts[0]?.name).toBe(person.display);

    state.role = "guardian";
    state.rows.guardian_relationships = [{ personId: "contact", gradeLevel: "9", ...person }];
    expect((await searchWorkspace({ data: { query: "Test" } })).students[0]?.label).toBe(person.display);

    state.rows.communication_participants = [{ id: "participant" }];
    state.rows.communication_threads = [{ id: "thread", subject: "Study plan", metadata: null }];
    state.rows.communication_messages = [{ id: "message", body: "Hello", sentAt: new Date("2026-01-01T00:00Z"),
      senderPersonId: "contact", ...person }];
    expect((await getThread({ data: { threadId: "thread" } })).messages[0]?.senderName).toBe(person.short);
  });

  it("still denies a non-participant before presenting sender names", async () => {
    await expect(getThread({ data: { threadId: "thread" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it.each(["transcript", "diploma"] as const)("keeps %s PDF names legal even when preferred names exist", async kind => {
    state.role = "registrar";
    state.rows.transcript_issuances = [{ id: "credential", studentProfileId: "student", issuingOrganizationId: "issuer",
      snapshot: { rows: [] }, issuedAt: new Date("2026-01-01T00:00Z") }];
    state.rows.diploma_issuances = [{ id: "credential", studentId: "student", issuerId: "issuer",
      decision: "approved", revokedAt: null, issuedAt: new Date("2026-01-01T00:00Z") }];
    state.rows.student_profiles = [{ first: " Jordan  Lee ", last: " Test ", preferredName: "Jo" }];
    state.rows.organizations = [{ name: "Test School" }];
    await renderAcademicCredential({ data: { kind, credentialId: "credential" } });
    expect(state.pdf).toHaveBeenCalledWith(expect.objectContaining({ student: "Jordan Lee Test" }));
  });
});

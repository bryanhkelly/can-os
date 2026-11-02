import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  requireActor: vi.fn(),
  assertCourse: vi.fn(),
  assignInstructor: vi.fn(),
  audit: vi.fn(),
  event: vi.fn(),
  lockSite: vi.fn(),
  firstLesson: vi.fn(),
  dbRows: [] as unknown[][],
  txRows: [] as unknown[][],
  insertRows: [] as unknown[][],
  updateRows: [] as unknown[][],
  updateValues: [] as unknown[],
  tx: null as any,
}));

function selectChain(rows: unknown[][]) {
  const chain: any = {
    from() { return this; },
    innerJoin() { return this; },
    where() { return this; },
    orderBy() { return this; },
    for() { return this; },
    limit() { return Promise.resolve(rows.shift() ?? []); },
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(rows.shift() ?? []).then(resolve, reject);
    },
  };
  return chain;
}

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator() { return this; },
    handler(callback: unknown) { return callback; },
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: vi.fn() }));
vi.mock("@/db/client", () => ({
  db: {
    select: () => selectChain(state.dbRows),
    transaction: (callback: (tx: unknown) => unknown) => callback(state.tx),
  },
}));
vi.mock("@/domain/attendance-configuration-lock", () => ({
  lockAttendanceConfigurationAtSite: state.lockSite,
}));
vi.mock("@/domain/first-class-lesson", () => ({
  requireAccessibleFirstLesson: state.firstLesson,
}));
vi.mock("@/platform/mutation", () => ({
  emitEvent: state.event,
  writeAudit: state.audit,
}));
vi.mock("@/modules/identity/actors.server", () => ({
  requireActor: state.requireActor,
}));
vi.mock("@/modules/programs/program-site-authorization.server", () => ({
  requireChurchHostedOperatingServices: vi.fn(),
}));
vi.mock("@/modules/staffing/launch-staffing.server", () => ({
  assignLaunchInstructor: state.assignInstructor,
  evaluateLaunchTeacher: vi.fn(),
  launchTeacherRolePredicate: vi.fn(),
}));
vi.mock("@/modules/profiles/qualification-catalog.server", () => ({
  canAuthorQualificationCatalog: vi.fn(),
}));
vi.mock("@/modules/identity/institutional-capability.server", () => ({
  hasInstitutionalProgramCapability: vi.fn(),
}));
vi.mock("@/modules/programs/teacher-policy.server", () => ({
  listLaunchTeacherPolicies: vi.fn(),
  teacherPolicyPublisherCapability: "teacher.policy.publish",
}));
vi.mock("@/modules/programs/launch-curriculum-eligibility.server", () => ({
  assertLaunchEligibleCourse: state.assertCourse,
  listLaunchEligibleCourses: vi.fn(),
}));
vi.mock("@/modules/programs/section-readiness-service", () => ({
  evaluateSectionReadiness: vi.fn(),
}));
vi.mock("@/modules/learning/first-classroom.server", () => ({
  readFirstClassrooms: vi.fn(),
}));

import { provisionLaunchSection } from "@/modules/programs/launch-academics.functions";

const actor = {
  actorPersonId: "registrar",
  role: "registrar",
  capabilities: new Set(["program.launch.start"]),
  scope: { organizationIds: ["org"], siteIds: ["site"], programIds: ["program"] },
};
const program = {
  id: "program",
  name: "North School",
  status: "launching",
  siteId: "site",
  organizationId: "org",
  academicProviderOrganizationId: "org",
  deliveryModel: {},
};
const request = {
  id: "10000000-0000-4000-8000-000000000001",
  type: "section_creation_request",
  status: "open",
  ownerPersonId: "teacher",
  organizationId: "org",
  siteId: "site",
  programId: "program",
  subjectType: "program",
  subjectId: "program",
  metadata: {
    requestOrigin: "teacher_classes",
    requestedClassTitle: "Biology Lab",
    requestedCourseOrSubject: "Biology",
    desiredTerm: "Fall",
  },
};
const input = {
  programId: "program",
  termId: "term",
  courseTemplateVersionId: "version",
  code: "BIO-LAB-A",
  title: "Biology Lab",
  teacherPersonId: "teacher",
  scheduleTemplateId: "schedule",
  classRequestId: request.id,
};

beforeEach(() => {
  vi.clearAllMocks();
  state.dbRows = [[program], [{
    id: "term",
    schoolYearId: "year",
    siteId: "site",
    organizationId: "org",
    programId: "program",
  }]];
  state.txRows = [[request], [{ curriculum: {} }], [{ schoolYearId: "year" }],
    [{ dayOfWeek: 1, startsAtLocal: "08:00", endsAtLocal: "09:00" }],
    [{ scheduleTemplateId: "schedule" }]];
  state.insertRows = [[{
    id: "section",
    versionId: "version",
    title: "Biology Lab",
    metadata: {},
  }]];
  state.updateRows = [[{ id: request.id }]];
  state.updateValues = [];
  state.requireActor.mockResolvedValue(actor);
  state.assignInstructor.mockResolvedValue({ created: true });
  state.tx = {
    select: vi.fn(() => selectChain(state.txRows)),
    insert: vi.fn(() => ({
      values: vi.fn(() => {
        const result = {
          onConflictDoNothing() { return result; },
          returning: () => Promise.resolve(state.insertRows.shift() ?? []),
        };
        return result;
      }),
    })),
    update: vi.fn(() => ({
      set: (values: unknown) => {
        state.updateValues.push(values);
        return {
          where: () => ({
            returning: () => Promise.resolve(state.updateRows.shift() ?? []),
          }),
        };
      },
    })),
  };
});

describe("registrar fulfillment of teacher class requests", () => {
  it("creates the Section and resolves the request atomically through launch provisioning", async () => {
    await expect(provisionLaunchSection({ data: input })).resolves.toEqual({
      sectionId: "section",
      created: true,
    });

    expect(state.assertCourse).toHaveBeenCalledOnce();
    expect(state.assignInstructor).toHaveBeenCalledWith(
      state.tx,
      actor,
      expect.objectContaining({ programId: "program", sectionId: "section", teacherPersonId: "teacher" }),
    );
    expect(state.updateValues).toHaveLength(1);
    expect(state.updateValues[0]).toEqual(expect.objectContaining({
      status: "resolved",
      metadata: expect.objectContaining({ provisionedSectionId: "section" }),
    }));
    expect(state.audit).toHaveBeenCalled();
    expect(state.event).toHaveBeenCalledWith(state.tx, expect.objectContaining({
      eventType: "SectionCreationRequestFulfilled",
      aggregateId: request.id,
    }));
  });
});

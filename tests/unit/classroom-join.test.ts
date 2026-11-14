import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  classroomPresentationForActor,
  endClassroomSessionForActor,
  joinClassroomSessionForActor,
  openClassroomSessionForActor,
  rotateClassroomJoinCodeForActor,
} from "@/modules/learning/classroom-join.server";

const { transaction, select, insert, update, values, returning, set, emitEvent, recordAudit } = vi.hoisted(() => ({
  transaction: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  values: vi.fn(),
  returning: vi.fn(),
  set: vi.fn(),
  emitEvent: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock("@/db/client", () => ({ db: { transaction } }));
vi.mock("@/platform/mutation", () => ({ emitEvent }));
vi.mock("@/modules/identity/actors.server", () => ({ recordAudit }));

/** Chainable thenable standing in for a drizzle select builder. */
function query(data: unknown[]) {
  const result = Promise.resolve(data);
  const chain = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    for: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(data),
    then: result.then.bind(result),
  };
  return chain;
}

const SITE = "f1000000-0000-4000-8000-000000000003";
const FACILITATOR = "facilitator-person";
const LEARNER = "learner-person";

function facilitator() {
  return { accountId: "acct", sessionId: "sess", actorPersonId: FACILITATOR, role: "teacher", scope: { siteIds: [SITE], programIds: [] } };
}
function learner() {
  return { accountId: "acct2", sessionId: "sess2", actorPersonId: LEARNER, role: "student", scope: { siteIds: [SITE], programIds: [] } };
}

const openSessionRow = {
  id: "session-1", siteId: SITE, title: "AI Foundations",
  status: "open", facilitatorPersonId: FACILITATOR,
  openedAt: new Date(), endedAt: null, metadata: {},
};
const activeTokenRow = {
  id: "token-1", sessionId: "session-1", code: "ABC234",
  status: "active", expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  failedAttempts: 0,
};

beforeEach(() => {
  vi.resetAllMocks();
  transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback({ select, insert, update }));
  insert.mockReturnValue({ values });
  values.mockImplementation(() => ({ returning, onConflictDoUpdate: () => ({ returning }) }));
  update.mockReturnValue({ set });
  set.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
  emitEvent.mockResolvedValue(undefined);
  recordAudit.mockResolvedValue(undefined);
});

describe("openClassroomSessionForActor", () => {
  it("opens a session into the live state and issues a join code", async () => {
    returning
      .mockResolvedValueOnce([{ id: "session-1", title: "AI Foundations" }])
      .mockResolvedValueOnce([{ id: "token-1", code: "ABC234" }]);
    const result = await openClassroomSessionForActor(facilitator(), { title: "AI Foundations", siteId: SITE });
    expect(result).toEqual({ sessionId: "session-1", title: "AI Foundations", code: "ABC234" });
    expect(emitEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      eventType: "ClassroomSessionOpened", aggregateId: "session-1",
    }));
  });

  it("rejects a site outside the actor's grant", async () => {
    await expect(openClassroomSessionForActor(facilitator(), { title: "Nope", siteId: "other-site" }))
      .rejects.toThrow("site scope");
  });
});

describe("joinClassroomSessionForActor", () => {
  it("joins an open session with an active code and records participant + connection", async () => {
    select
      .mockReturnValueOnce(query([activeTokenRow]))  // token lookup
      .mockReturnValueOnce(query([openSessionRow]))  // session lookup
      .mockReturnValueOnce(query([{ id: "enrollment-1" }])); // site enrollment check
    returning
      .mockResolvedValueOnce([{ id: "participant-1", joinedAt: new Date() }])
      .mockResolvedValueOnce([{ id: "connection-1" }]);
    const result = await joinClassroomSessionForActor(learner(), {
      code: "ABC234", deviceKey: "device-key-1", idempotencyKey: "idem-1",
    });
    expect(result).toMatchObject({ sessionId: "session-1", title: "AI Foundations", participantId: "participant-1" });
    expect(recordAudit).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({
      action: "classroom.session.join", resourceId: "session-1",
    }));
    expect(emitEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      eventType: "ClassroomSessionJoined",
    }));
  });

  it("normalizes lowercase codes before lookup", async () => {
    select
      .mockReturnValueOnce(query([activeTokenRow]))
      .mockReturnValueOnce(query([openSessionRow]))
      .mockReturnValueOnce(query([{ id: "enrollment-1" }]));
    returning
      .mockResolvedValueOnce([{ id: "participant-1", joinedAt: new Date() }])
      .mockResolvedValueOnce([{ id: "connection-1" }]);
    await expect(joinClassroomSessionForActor(learner(), {
      code: "abc-234", deviceKey: "device-key-1", idempotencyKey: "idem-1",
    })).resolves.toMatchObject({ participantId: "participant-1" });
  });

  it("rejects unknown codes with a non-enumerating message", async () => {
    select.mockReturnValueOnce(query([]));
    await expect(joinClassroomSessionForActor(learner(), {
      code: "NOPE42", deviceKey: "device-key-1", idempotencyKey: "idem-1",
    })).rejects.toThrow("That class code is not valid");
    expect(values).not.toHaveBeenCalled();
  });

  it("counts failures against an expired token and revokes at the threshold", async () => {
    const expiredToken = { ...activeTokenRow, expiresAt: new Date(Date.now() - 1000), failedAttempts: 9 };
    select
      .mockReturnValueOnce(query([expiredToken]))
      .mockReturnValueOnce(query([openSessionRow]));
    await expect(joinClassroomSessionForActor(learner(), {
      code: "ABC234", deviceKey: "device-key-1", idempotencyKey: "idem-1",
    })).rejects.toThrow("That class code is not valid");
    // failedAttempts 9 → the next attempt revokes the token.
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ failedAttempts: 10, status: "revoked" }));
  });

  it("requires an active enrollment at the session's site when site-scoped", async () => {
    select
      .mockReturnValueOnce(query([activeTokenRow]))
      .mockReturnValueOnce(query([openSessionRow]))
      .mockReturnValueOnce(query([])); // no enrollment
    await expect(joinClassroomSessionForActor(learner(), {
      code: "ABC234", deviceKey: "device-key-1", idempotencyKey: "idem-1",
    })).rejects.toThrow("enrollment at this classroom site");
    expect(values).not.toHaveBeenCalled();
  });

  it("accepts any authenticated person when the session is not site-scoped (pre-config slice)", async () => {
    select
      .mockReturnValueOnce(query([activeTokenRow]))
      .mockReturnValueOnce(query([{ ...openSessionRow, siteId: null }]));
    returning
      .mockResolvedValueOnce([{ id: "participant-1", joinedAt: new Date() }])
      .mockResolvedValueOnce([{ id: "connection-1" }]);
    await expect(joinClassroomSessionForActor(learner(), {
      code: "ABC234", deviceKey: "device-key-1", idempotencyKey: "idem-1",
    })).resolves.toMatchObject({ participantId: "participant-1" });
  });

  it("never joins an ended session even with a still-valid code", async () => {
    select
      .mockReturnValueOnce(query([activeTokenRow]))
      .mockReturnValueOnce(query([{ ...openSessionRow, status: "ended" }]));
    await expect(joinClassroomSessionForActor(learner(), {
      code: "ABC234", deviceKey: "device-key-1", idempotencyKey: "idem-1",
    })).rejects.toThrow("That class code is not valid");
  });
});

describe("facilitator authorization", () => {
  it("lets the assigned facilitator rotate the join code", async () => {
    select.mockReturnValueOnce(query([openSessionRow]));
    returning.mockResolvedValueOnce([{ id: "token-2", code: "XYZ789" }]);
    await expect(rotateClassroomJoinCodeForActor(facilitator(), "session-1"))
      .resolves.toEqual({ code: "XYZ789", expiresAt: expect.any(String) });
  });

  it("denies a teacher who is not the facilitator or a site admin", async () => {
    const outsider = { ...facilitator(), actorPersonId: "other-teacher" };
    select.mockReturnValueOnce(query([openSessionRow]));
    await expect(rotateClassroomJoinCodeForActor(outsider, "session-1"))
      .rejects.toThrow("classroom facilitator");
  });

  it("denies a facilitator-scoped actor from another site", async () => {
    const otherSiteAdmin = { ...facilitator(), actorPersonId: "admin", role: "site_admin", scope: { siteIds: ["elsewhere"], programIds: [] } };
    select.mockReturnValueOnce(query([openSessionRow]));
    await expect(rotateClassroomJoinCodeForActor(otherSiteAdmin, "session-1"))
      .rejects.toThrow("classroom facilitator");
  });
});

describe("endClassroomSessionForActor", () => {
  it("ends an open session and revokes active codes", async () => {
    select.mockReturnValueOnce(query([openSessionRow]));
    await expect(endClassroomSessionForActor(facilitator(), "session-1")).resolves.toEqual({ ended: true });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ status: "revoked", revokedAt: expect.any(Date) }));
  });

  it("refuses to re-end a closed session", async () => {
    select.mockReturnValueOnce(query([{ ...openSessionRow, status: "ended" }]));
    await expect(endClassroomSessionForActor(facilitator(), "session-1"))
      .rejects.toThrow("Session cannot be ended from ended");
  });
});

describe("classroomPresentationForActor", () => {
  it("returns aggregate-only presentation data with the active code", async () => {
    select
      .mockReturnValueOnce(query([openSessionRow]))
      .mockReturnValueOnce(query([{ code: "ABC234", status: "active", expiresAt: activeTokenRow.expiresAt }]))
      .mockReturnValueOnce(query([{ count: 12 }]));
    const data = await classroomPresentationForActor(facilitator(), "session-1");
    expect(data).toMatchObject({
      title: "AI Foundations", status: "open", code: "ABC234", participantCount: 12,
    });
    expect(JSON.stringify(data)).not.toContain(LEARNER);
  });

  it("denies learners the facilitator presentation", async () => {
    select.mockReturnValueOnce(query([openSessionRow]));
    await expect(classroomPresentationForActor(learner(), "session-1"))
      .rejects.toThrow("classroom facilitator");
  });
});

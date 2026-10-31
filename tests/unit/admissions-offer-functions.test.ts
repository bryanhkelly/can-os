import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activateOfferedEnrollment,
  issueAdmissionOffer,
  respondToAdmissionOffer,
} from "@/modules/enrollment/admissions-offer.functions";
import { AuthorizationError } from "@/domain/command-context";

const { select, getCommandContext, issue, respond, activate } = vi.hoisted(() => ({
  select: vi.fn(),
  getCommandContext: vi.fn(),
  issue: vi.fn(),
  respond: vi.fn(),
  activate: vi.fn(),
}));

vi.mock("@/db/client", () => ({ db: { select } }));
vi.mock("@/modules/identity/command-context.server", () => ({ getCommandContext }));
vi.mock("@/modules/enrollment/admissions-offer-service", () => ({
  issueSyntheticAdmissionOffer: issue,
  respondToSyntheticAdmissionOffer: respond,
  activateSyntheticOfferedEnrollment: activate,
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("https://can.local"),
  setResponseHeader: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator() { return this; },
    handler(callback: (input: unknown) => unknown) { return callback; },
  }),
}));

function rows(data: unknown[]) {
  const result = Promise.resolve(data);
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(data),
    then: result.then.bind(result),
  };
}

const application = {
  id: "application",
  programId: "program",
  studentProfileId: "profile",
  metadata: {},
};
const offer = { id: "offer", applicationId: application.id, programId: "program" };
const scopedProgram = { organizationId: "organization", siteId: "site" };
const input = { applicationId: application.id, schoolYearId: "year" };
const registrar = {
  actorPersonId: "registrar",
  role: "registrar",
  capabilities: new Set(["enrollment.decide", "enrollment.activate"]),
  scope: { programIds: ["program"], organizationIds: ["organization"], siteIds: ["site"] },
};
const guardian = {
  actorPersonId: "guardian",
  role: "guardian",
  capabilities: new Set(["enrollment.apply"]),
  scope: { programIds: ["program"] },
};

beforeEach(() => {
  vi.resetAllMocks();
  getCommandContext.mockResolvedValue(registrar);
  issue.mockResolvedValue("offer");
  respond.mockResolvedValue("offer");
  activate.mockResolvedValue("enrollment");
});
afterEach(() => vi.unstubAllEnvs());

describe("canonical admission offer server functions", () => {
  it("preserves the existing idempotency key when retrying issuance", async () => {
    select.mockReturnValueOnce(rows([application])).mockReturnValueOnce(rows([scopedProgram])).mockReturnValueOnce(rows([{
      id: "offer", status: "issued", expiresAt: null, idempotencyKey: "existing-key",
    }]));
    await expect(issueAdmissionOffer({ data: input })).resolves.toEqual({ offerId: "offer" });
    expect(issue).toHaveBeenCalledWith(registrar, expect.objectContaining({
      ...input, idempotencyKey: "existing-key",
    }));
  });

  it("retains the historical key namespace for the next issuance attempt", async () => {
    select.mockReturnValueOnce(rows([application])).mockReturnValueOnce(rows([scopedProgram])).mockReturnValueOnce(rows([{
      id: "old-offer", status: "declined", expiresAt: null, idempotencyKey: "old-key",
    }]));
    await issueAdmissionOffer({ data: input });
    expect(issue).toHaveBeenCalledWith(registrar, expect.objectContaining({
      idempotencyKey: "synthetic-offer:application:year:attempt-2",
    }));
  });

  it.each([
    { ...registrar, role: "guardian" },
    { ...registrar, capabilities: new Set<string>() },
    { ...registrar, scope: { programIds: [] } },
  ])("denies issuance without the required registrar grant: %j", async actor => {
    getCommandContext.mockResolvedValue(actor);
    select.mockReturnValueOnce(rows([application])).mockReturnValueOnce(rows([scopedProgram]));
    await expect(issueAdmissionOffer({ data: input })).rejects.toThrow(AuthorizationError);
    expect(issue).not.toHaveBeenCalled();
  });

  it("continues to require the explicit write gate for synthetic records", async () => {
    vi.stubEnv("CAN_DEMO_WRITES_ENABLED", "false");
    select.mockReturnValueOnce(rows([{ ...application, metadata: { synthetic: true } }]));
    await expect(issueAdmissionOffer({ data: input })).rejects.toThrow();
    expect(issue).not.toHaveBeenCalled();
  });

  it("denies a guardian response without the current enrollment relationship", async () => {
    getCommandContext.mockResolvedValue(guardian);
    select.mockReturnValueOnce(rows([offer])).mockReturnValueOnce(rows([application]))
      .mockReturnValueOnce(rows([{ personId: "student" }])).mockReturnValueOnce(rows([]));
    await expect(respondToAdmissionOffer({ data: { offerId: "offer", decision: "accept" } }))
      .rejects.toThrow("Guardian relationship missing");
    expect(respond).not.toHaveBeenCalled();
  });

  it("delegates an authorized guardian response to the existing command", async () => {
    getCommandContext.mockResolvedValue(guardian);
    select.mockReturnValueOnce(rows([offer])).mockReturnValueOnce(rows([application]))
      .mockReturnValueOnce(rows([{ personId: "student" }])).mockReturnValueOnce(rows([{ id: "guardian" }]));
    await expect(respondToAdmissionOffer({ data: { offerId: "offer", decision: "accept" } }))
      .resolves.toEqual({ offerId: "offer" });
    expect(respond).toHaveBeenCalledWith(guardian, "offer", "accept");
  });

  it("delegates registrar activation without changing its command boundary", async () => {
    select.mockReturnValueOnce(rows([offer])).mockReturnValueOnce(rows([application])).mockReturnValueOnce(rows([scopedProgram]));
    await expect(activateOfferedEnrollment({ data: { offerId: "offer" } }))
      .resolves.toEqual({ enrollmentId: "enrollment" });
    expect(activate).toHaveBeenCalledWith(registrar, "offer", undefined);
  });

  it("passes the optional sectionId through to activation", async () => {
    select.mockReturnValueOnce(rows([offer])).mockReturnValueOnce(rows([application])).mockReturnValueOnce(rows([scopedProgram]));
    await expect(activateOfferedEnrollment({ data: { offerId: "offer", sectionId: "section" } }))
      .resolves.toEqual({ enrollmentId: "enrollment" });
    expect(activate).toHaveBeenCalledWith(registrar, "offer", "section");
  });
});

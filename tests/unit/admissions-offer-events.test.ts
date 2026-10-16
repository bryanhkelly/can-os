import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activateSyntheticOfferedEnrollment,
  issueSyntheticAdmissionOffer,
  respondToSyntheticAdmissionOffer,
} from "@/modules/enrollment/admissions-offer-service";
import { activateEnrollmentFromApplication } from "@/modules/enrollment/gf2-service";

const { transaction, select, values, update } = vi.hoisted(() => ({
  transaction: vi.fn(),
  select: vi.fn(),
  values: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@/db/client", () => ({ db: { transaction } }));
vi.mock("@/modules/student-experience/demo-write-gate", () => ({
  assertSyntheticMutation: vi.fn(),
}));

function rows(data: unknown[]) {
  const result = Promise.resolve(data);
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    for: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(data),
    then: result.then.bind(result),
  };
}
function selectRows(...data: unknown[][]) {
  for (const value of data) select.mockReturnValueOnce(rows(value));
}
const context = {
  actorPersonId: "actor",
  capabilities: new Set(["enrollment.decide", "enrollment.apply", "enrollment.activate"]),
  scope: { programIds: ["program"] },
};
const application = { id: "application", programId: "program", studentProfileId: "student", stage: "application", metadata: { synthetic: true } };
const pool = { capacity: 2 };
const year = { programId: "program", organizationId: "organization" };
const program = { organizationId: "organization" };
const journey = { id: "journey", status: "ready" };
const offer = { id: "offer", programId: "program", schoolYearId: "year", applicationId: "application", status: "issued", expiresAt: null };
const input = { applicationId: "application", schoolYearId: "year", idempotencyKey: "key", expiresAt: new Date("2099-01-01T00:00:00Z") };

beforeEach(() => {
  vi.resetAllMocks();
  const tx = {
    select,
    insert: vi.fn().mockReturnValue({ values }),
    update,
  };
  transaction.mockImplementation(async (callback) => callback(tx));
  values.mockReturnValue({
    returning: vi.fn().mockResolvedValue([{ id: "created" }]),
    then: Promise.resolve().then.bind(Promise.resolve()),
  });
  update.mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) });
});

describe("transactional admissions events", () => {
  it("emits offer issuance alongside audit", async () => {
    selectRows([application], [pool], [year], [program], [], [journey], [], [], []);
    await expect(issueSyntheticAdmissionOffer(context, input)).resolves.toBe("created");
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "AdmissionOfferIssued", aggregateId: "created",
    }));
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ action: "admissions.offer.issue" }));
  });

  it("rejects non-synthetic applications before issuing an offer", async () => {
    selectRows([{ ...application, metadata: { synthetic: false } }]);
    await expect(issueSyntheticAdmissionOffer(context, input)).rejects.toThrow("Synthetic application not found");
    expect(values).not.toHaveBeenCalled();
  });

  it("refuses to reissue a declined offer under the same idempotency key", async () => {
    selectRows([application], [pool], [year], [program], [{ ...offer, status: "declined" }]);
    await expect(issueSyntheticAdmissionOffer(context, input)).rejects.toThrow("no longer actionable");
    expect(values).not.toHaveBeenCalled();
  });

  it("rejects non-synthetic guardian responses before changing the offer", async () => {
    selectRows([offer], [pool], [year], [program], [offer], [{ ...application, metadata: { synthetic: false } }]);
    await expect(respondToSyntheticAdmissionOffer(context, "offer", "accept")).rejects.toThrow("Synthetic offer application mismatch");
    expect(values).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects non-synthetic enrollment activation before inserting a student", async () => {
    selectRows([offer], [pool], [year], [program], [{ ...offer, status: "accepted" }],
      [{ ...application, metadata: { synthetic: false }, stage: "accepted" }]);
    await expect(activateSyntheticOfferedEnrollment(context, "offer")).rejects.toThrow("Synthetic application not accepted");
    expect(values).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("does not emit another event for an issuance retry", async () => {
    selectRows([application], [pool], [year], [program], [offer]);
    await expect(issueSyntheticAdmissionOffer(context, input)).resolves.toBe("offer");
    expect(values).not.toHaveBeenCalled();
  });

  it.each(["accept", "decline"] as const)("emits the %s transition", async (action) => {
    selectRows([offer], [pool], [year], [program], [offer], [application], [{ personId: "person" }], [{ id: "relationship" }]);
    if (action === "accept") selectRows([journey], []);
    await expect(respondToSyntheticAdmissionOffer(context, "offer", action)).resolves.toBe("offer");
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      eventType: action === "accept" ? "AdmissionOfferAccepted" : "AdmissionOfferDeclined",
      aggregateId: "offer",
    }));
    if (action === "accept") {
      expect(values).toHaveBeenCalledWith(expect.objectContaining({
        eventType: "ApplicationAccepted", aggregateId: "application",
      }));
    }
  });

  it("emits activation and audits the Journey transition", async () => {
    selectRows([offer], [pool], [year], [program], [{ ...offer, status: "accepted" }],
      [{ ...application, stage: "accepted" }], [], [journey], [], [], []);
    await expect(activateSyntheticOfferedEnrollment(context, "offer")).resolves.toBe("created");
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "EnrollmentActivated", aggregateId: "created",
    }));
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      action: "journey.activate", resourceId: "journey",
      before: { status: "ready" }, after: { status: "active" },
    }));
  });

  it("keeps activation retries idempotent after the Journey becomes active", async () => {
    selectRows([offer], [pool], [year], [program], [{ ...offer, status: "accepted" }],
      [{ ...application, stage: "accepted" }], [{ id: "existing" }]);
    await expect(activateSyntheticOfferedEnrollment(context, "offer")).resolves.toBe("existing");
    expect(values).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("also allows legacy activation retries after the Journey becomes active", async () => {
    selectRows([{ ...application, stage: "accepted" }], [], [program], [year],
      [{ ...journey, status: "active" }], [{ id: "existing" }]);
    await expect(activateEnrollmentFromApplication(context, "application", "year")).resolves.toBe("existing");
    expect(values).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("does not create a new legacy enrollment without Journey readiness", async () => {
    selectRows([{ ...application, stage: "accepted" }], [], [program], [year],
      [{ ...journey, status: "in_progress" }], []);
    await expect(activateEnrollmentFromApplication(context, "application", "year")).rejects.toThrow("ready");
    expect(values).not.toHaveBeenCalled();
  });
});

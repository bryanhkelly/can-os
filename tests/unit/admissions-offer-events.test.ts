import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activateSyntheticOfferedEnrollment,
  expireSyntheticAdmissionOffers,
  issueSyntheticAdmissionOffer,
  respondToSyntheticAdmissionOffer,
} from "@/modules/enrollment/admissions-offer-service";
import { acceptApplication, activateEnrollmentFromApplication, startFamilyApplication } from "@/modules/enrollment/enrollment-service";

const { transaction, select, values, update } = vi.hoisted(() => ({
  transaction: vi.fn(),
  select: vi.fn(),
  values: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@/db/client", () => ({ db: { transaction } }));
vi.mock("@/modules/_demo/demo-write-gate", () => ({
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
const registrarContext = { ...context, role: "registrar" };
const guardianContext = { ...context, role: "guardian" };
const application = { id: "application", programId: "program", studentProfileId: "student", stage: "application", metadata: { synthetic: true } };
const pool = { capacity: 2 };
const year = { programId: "program", organizationId: "organization" };
const program = { organizationId: "organization" };
const journey = { id: "journey", status: "ready" };
const programSite = { siteId: "f1000000-0000-4000-8000-000000000001", organizationId: "organization" };
const offer = { id: "offer", programId: "program", schoolYearId: "year", applicationId: "application", status: "issued", expiresAt: null };
const input = { applicationId: "application", schoolYearId: "year", idempotencyKey: "key", expiresAt: new Date("2099-01-01T00:00:00Z") };

beforeEach(() => {
  vi.resetAllMocks();
  const tx = {
    select,
    insert: vi.fn().mockReturnValue({ values }),
    update,
    execute: vi.fn().mockResolvedValue(undefined),
  };
  transaction.mockImplementation(async (callback) => callback(tx));
  values.mockReturnValue({
    returning: vi.fn().mockResolvedValue([{ id: "created" }]),
    then: Promise.resolve().then.bind(Promise.resolve()),
  });
  update.mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) });
});

describe("family application retry authorization", () => {
  it("rejects a former household member even if their application idempotency key matches", async () => {
    selectRows([{
      applicationId:"existing-application",
      householdId:"household",
      studentProfileId:"student",
      submittedByPersonId:"actor",
      programId:"program",
    }], []);
    await expect(startFamilyApplication(context,{
      programId:"program",idempotencyKey:"existing-key",
      student:{legalFirstName:"Synthetic",legalLastName:"Student"},
    })).rejects.toThrow("Guardian is no longer a member");
    expect(values).not.toHaveBeenCalled();
  });
});

describe("family application authorized retry", () => {
  const existing = {
    applicationId:"existing-application", householdId:"household",
    studentProfileId:"student", submittedByPersonId:"actor", programId:"program",
  };
  const args = {programId:"program",idempotencyKey:"existing-key",
    student:{legalFirstName:"Synthetic",legalLastName:"Student"}};
  it("returns the original application without creating duplicate records when membership is still valid", async () => {
    selectRows([existing], [{id:"membership"}], [{id:"existing-journey"}]);
    await expect(startFamilyApplication(context,args)).resolves.toEqual({
      applicationId:"existing-application",householdId:"household",
      studentProfileId:"student",journeyId:"existing-journey",
    });
    expect(values).not.toHaveBeenCalled();
  });
  it("rejects a replay after program access is revoked before querying the database", async () => {
    await expect(startFamilyApplication({...context,scope:{programIds:[]}},args))
      .rejects.toThrow("program scope");
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe("legacy enrollment scope checks", () => {
  it("denies application acceptance without program authorization", async () => {
    selectRows([{id:"application",programId:"program",stage:"application"}]);
    await expect(acceptApplication({...context,scope:{}},"application")).rejects.toThrow("program scope");
    expect(update).not.toHaveBeenCalled();
  });
  it("denies legacy activation without program authorization", async () => {
    selectRows([{id:"application",programId:"program",stage:"accepted"}]);
    await expect(activateEnrollmentFromApplication({...context,scope:{}},"application","year")).rejects.toThrow("program scope");
    expect(values).not.toHaveBeenCalled();
  });
});

describe("transactional admissions events", () => {
  it("expires an elapsed synthetic offer and records audit under the seat pool lock", async () => {
    selectRows([pool], [year], [program], [{id:"expired-offer",applicationId:"application",expiresAt:new Date("2020-01-01T00:00:00Z"),metadata:{synthetic:true}}]);
    await expect(expireSyntheticAdmissionOffers(registrarContext,{programId:"program",schoolYearId:"year"})).resolves.toBe(1);
    expect(update).toHaveBeenCalled();
    expect(values).toHaveBeenCalledWith(expect.objectContaining({action:"admissions.offer.expire",resourceId:"expired-offer"}));
  });

  it("emits offer issuance alongside audit", async () => {
    selectRows([application], [pool], [year], [program], [], [], [], [journey], [], [], [], [{personId:"student-person"}], [{personId:"guardian-person"}]);
    await expect(issueSyntheticAdmissionOffer(registrarContext, input)).resolves.toBe("created");
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "AdmissionOfferIssued", aggregateId: "created",
    }));
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ action: "admissions.offer.issue" }));
    expect(values).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({recipientPersonId:"guardian-person",type:"admission_offer_issued",resourceId:"created"})]));
  });

  it("rejects an expired offer on the idempotency retry path", async () => {
    selectRows([application], [pool], [year], [program], [],
      [{...offer,idempotencyKey:"key",expiresAt:new Date("2020-01-01T00:00:00Z")}]);
    await expect(issueSyntheticAdmissionOffer(registrarContext,input)).rejects.toThrow(/expired|no longer actionable/);
    expect(values).not.toHaveBeenCalled();
  });

  it("rejects a second live offer with a different idempotency key", async () => {
    selectRows([application], [pool], [year], [program], [], [],
      [{id:"existing",status:"issued",expiresAt:new Date("2099-01-01T00:00:00Z")}]);
    await expect(issueSyntheticAdmissionOffer(registrarContext, input)).rejects.toThrow("An active offer already exists");
    expect(values).not.toHaveBeenCalled();
  });

  it("rejects issuance when authorized program scope is missing", async () => {
    selectRows([application]);
    await expect(issueSyntheticAdmissionOffer({...registrarContext,scope:{}},input)).rejects.toThrow("program scope");
    expect(values).not.toHaveBeenCalled();
  });

  it("rejects guardian response when authorized program scope is missing", async () => {
    selectRows([offer]);
    await expect(respondToSyntheticAdmissionOffer({...guardianContext,scope:{}},"offer","accept")).rejects.toThrow("program scope");
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects activation when authorized program scope is missing", async () => {
    selectRows([offer]);
    await expect(activateSyntheticOfferedEnrollment({...registrarContext,scope:{}},"offer")).rejects.toThrow("program scope");
    expect(values).not.toHaveBeenCalled();
  });

  it("allows issuing an offer for a live (non-synthetic) application", async () => {
    selectRows([{ ...application, metadata: { synthetic: false } }], [pool], [year], [program], [], [], [], [journey], [], [], [], [{personId:"student-person"}], [{personId:"guardian-person"}]);
    await expect(issueSyntheticAdmissionOffer(registrarContext, input)).resolves.toBe("created");
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ action: "admissions.offer.issue" }));
  });

  it("refuses to reissue a declined offer under the same idempotency key", async () => {
    selectRows([application], [pool], [year], [program], [], [{ ...offer, status: "declined" }]);
    await expect(issueSyntheticAdmissionOffer(registrarContext, input)).rejects.toThrow("no longer actionable");
    expect(values).not.toHaveBeenCalled();
  });

  it("allows a guardian response on a live (non-synthetic) application", async () => {
    selectRows([offer], [pool], [year], [program], [offer], [{ ...application, metadata: { synthetic: false } }],
      [{ personId: "student-person" }], [{ id: "relationship" }], [journey], []);
    await expect(respondToSyntheticAdmissionOffer(guardianContext, "offer", "accept")).resolves.toBe("offer");
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "AdmissionOfferAccepted", aggregateId: "offer",
    }));
  });

  it("allows activating a live (non-synthetic) accepted application", async () => {
    selectRows([offer], [pool], [year], [program], [{ ...offer, status: "accepted", respondedAt: new Date("2026-10-01T00:00:00Z") }],
      [{ ...application, metadata: { synthetic: false }, stage: "accepted" }], [programSite], [], [journey], [], [], [], [{personId:"student-person"}]);
    await expect(activateSyntheticOfferedEnrollment(registrarContext, "offer")).resolves.toBe("created");
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "EnrollmentActivated", aggregateId: "created",
    }));
  });

  it("refuses issuance when the seat pool is full", async () => {
    selectRows([application], [{ capacity: 1 }], [year], [program], [], [], [], [journey], [],
      [{ studentId: "already-enrolled" }], []);
    await expect(issueSyntheticAdmissionOffer(registrarContext, input)).rejects.toThrow("Seat pool is full");
    expect(values).not.toHaveBeenCalled();
  });

  it("refuses issuance with an outstanding blocking requirement", async () => {
    selectRows([application], [pool], [year], [program], [], [], [], [journey],
      [{ status: "needs_you" }]);
    await expect(issueSyntheticAdmissionOffer(registrarContext, input)).rejects.toThrow("Blocking requirements remain");
    expect(values).not.toHaveBeenCalled();
  });

  it("refuses issuance before the enrollment journey is ready", async () => {
    selectRows([application], [pool], [year], [program], [], [], [], [{ ...journey, status: "in_progress" }]);
    await expect(issueSyntheticAdmissionOffer(registrarContext, input)).rejects.toThrow("Enrollment Journey must be ready");
    expect(values).not.toHaveBeenCalled();
  });

  it("denies guardian acceptance without a managing relationship", async () => {
    selectRows([offer], [pool], [year], [program], [offer], [application],
      [{ personId: "student-person" }], []);
    await expect(respondToSyntheticAdmissionOffer(guardianContext, "offer", "accept")).rejects.toThrow("Guardian is not authorized");
    expect(values).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("does not emit another event for an issuance retry", async () => {
    selectRows([application], [pool], [year], [program], [], [offer]);
    await expect(issueSyntheticAdmissionOffer(registrarContext, input)).resolves.toBe("offer");
    expect(values).not.toHaveBeenCalled();
  });

  it.each(["accept", "decline"] as const)("emits the %s transition", async (action) => {
    const issuedOffer={...offer,issuedByPersonId:"registrar-person"};
    selectRows([issuedOffer], [pool], [year], [program], [issuedOffer], [application], [{ personId: "person" }], [{ id: "relationship" }]);
    if (action === "accept") selectRows([journey], []);
    await expect(respondToSyntheticAdmissionOffer(guardianContext, "offer", action)).resolves.toBe("offer");
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      eventType: action === "accept" ? "AdmissionOfferAccepted" : "AdmissionOfferDeclined",
      aggregateId: "offer",
    }));
    if (action === "accept") {
      expect(values).toHaveBeenCalledWith(expect.objectContaining({
        eventType: "ApplicationAccepted", aggregateId: "application",
      }));
    }
    expect(values).toHaveBeenCalledWith(expect.objectContaining({recipientPersonId:"registrar-person",type:action==="accept"?"admission_offer_accepted":"admission_offer_declined",resourceId:"offer"}));
  });

  it("does not activate an accepted offer missing a guardian response timestamp", async () => {
    selectRows([offer], [pool], [year], [program], [{ ...offer, status: "accepted", respondedAt: null }]);
    await expect(activateSyntheticOfferedEnrollment(registrarContext, "offer")).rejects.toThrow("Accepted offer must record a guardian response");
    expect(values).not.toHaveBeenCalled();
  });

  it("emits activation and audits the Journey transition", async () => {
    selectRows([offer], [pool], [year], [program], [{ ...offer, status: "accepted", respondedAt: new Date("2026-10-01T00:00:00Z") }],
      [{ ...application, stage: "accepted" }], [programSite], [], [journey], [], [], [], [{personId:"student-person"}]);
    await expect(activateSyntheticOfferedEnrollment(registrarContext, "offer")).resolves.toBe("created");
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "EnrollmentActivated", aggregateId: "created",
    }));
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      action: "journey.activate", resourceId: "journey",
      before: { status: "ready" }, after: { status: "active" },
    }));
  });

  it("keeps activation retries idempotent after the Journey becomes active", async () => {
    selectRows([offer], [pool], [year], [program], [{ ...offer, status: "accepted", respondedAt: new Date("2026-10-01T00:00:00Z") }],
      [{ ...application, stage: "accepted" }], [programSite], [{ id: "existing" }]);
    await expect(activateSyntheticOfferedEnrollment(registrarContext, "offer")).resolves.toBe("existing");
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

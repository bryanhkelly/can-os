import { beforeEach, describe, expect, it, vi } from "vitest";
import { programs } from "@/db/schema";
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
// These command tests exercise admissions state, evidence and authorization
// ordering. Church-hosted contract selection is covered separately by focused
// unit and disposable-database integration suites; a null result models an
// ordinary non-church Program here without consuming mocked query rows.
vi.mock("@/modules/programs/program-site-authorization.server", () => ({
  requireChurchHostedOperatingServices: vi.fn().mockResolvedValue(null),
}));

// The admissions command now reads Program scope in multiple places. Give
// those reads canonical fixtures by table identity rather than positional mock
// rows; the remaining queue still checks the actual command ordering.
let selectedRows: unknown[][] = [];
function rows() {
  let data: unknown[] = [];
  const query = {
    from: vi.fn((table: unknown) => {
      data = table === programs ? [program] : (selectedRows.shift() ?? []);
      return query;
    }),
    innerJoin: vi.fn(() => query),
    where: vi.fn(() => query),
    for: vi.fn(() => query),
    limit: vi.fn(async () => data),
    then: (resolve: (value: unknown[]) => unknown, reject?: (error: unknown) => unknown) =>
      Promise.resolve(data).then(resolve, reject),
  };
  return query;
}
function selectRows(...data: unknown[][]) {
  selectedRows.push(...data);
}
const context = {
  actorPersonId: "actor",
  capabilities: new Set(["enrollment.decide", "enrollment.apply", "enrollment.activate"]),
  scope: { programIds: ["program"], organizationIds: ["organization"] },
};
const registrarContext = { ...context, role: "registrar" };
const guardianContext = { ...context, role: "guardian" };
const application = { id: "application", programId: "program", studentProfileId: "student", stage: "application", metadata: { synthetic: true } };
const pool = { capacity: 2 };
const year = { programId: "program", organizationId: "organization", siteId: null };
const program = { organizationId: "organization", siteId: null, status: "active" };
const journey = { id: "journey", status: "ready" };
const offer = { id: "offer", programId: "program", schoolYearId: "year", applicationId: "application", status: "issued", expiresAt: null };
const input = { applicationId: "application", schoolYearId: "year", idempotencyKey: "key", expiresAt: new Date("2099-01-01T00:00:00Z") };

beforeEach(() => {
  vi.resetAllMocks();
  selectedRows = [];
  select.mockImplementation(() => rows());
  const tx = {
    select,
    insert: vi.fn().mockReturnValue({ values }),
    update,
    execute: vi.fn().mockResolvedValue(undefined),
  };
  transaction.mockImplementation(async (callback) => callback(tx));
  values.mockImplementation((data:unknown)=>({
    returning: vi.fn().mockResolvedValue(Array.isArray(data)?data.map((_,index)=>({id:`created-${index}`})):[{ id: "created" }]),
    then: Promise.resolve().then.bind(Promise.resolve()),
  }));
  update.mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) });
});

describe("family application retry authorization", () => {
  it("rejects a former household member even if their application idempotency key matches", async () => {
    selectRows([{
      applicationId:"existing-application",
      householdId:"household",
      studentProfileId:"student",
      submittedByPersonId:"actor",
      programId:"program", metadata: {},
    }], []);
    await expect(startFamilyApplication(context,{
      programId:"program",idempotencyKey:"existing-key",
      student:{legalFirstName:"Synthetic",legalLastName:"Student"},
    })).rejects.toThrow("Guardian is no longer a member");
    expect(values).not.toHaveBeenCalled();
  });

  describe("application offer availability",()=>{
   it.each(["withdrawn","declined","inquiry"])("denies issuance for a %s application before reserving a seat",async stage=>{
    selectRows([{...application,stage}]);
    await expect(issueSyntheticAdmissionOffer(registrarContext,input)).rejects.toThrow("not open");
    expect(values).not.toHaveBeenCalled();
   });
   it("denies issuance for a waitlisted application",async()=>{
    selectRows([{...application,metadata:{synthetic:true,admissionsDisposition:"waitlisted"}}]);
    await expect(issueSyntheticAdmissionOffer(registrarContext,input)).rejects.toThrow("Restore the waitlisted");
    expect(values).not.toHaveBeenCalled();
   });
   it.each(["withdrawn","declined","waitlisted"])("does not let a guardian revive a %s application",async state=>{
    selectRows([offer],[pool],[year],[offer],
     [{...application,stage:state==="waitlisted"?"eligibility":state,
      metadata:{synthetic:true,admissionsDisposition:state==="waitlisted"?"waitlisted":null}}],
     [{personId:"student-person"}],[{id:"relationship",canManageEnrollment:true,metadata:{verification:"verified"}}]);
    await expect(respondToSyntheticAdmissionOffer(guardianContext,"offer","accept")).rejects.toThrow(/not open|Restore the waitlisted/);
    expect(update).not.toHaveBeenCalled();
    expect(values).not.toHaveBeenCalled();
   });
   it("denies legacy acceptance of a waitlisted application",async()=>{
    selectRows([{...application,metadata:{synthetic:true,admissionsDisposition:"waitlisted"}}]);
    await expect(acceptApplication(registrarContext,application.id)).rejects.toThrow("Restore the waitlisted");
    expect(update).not.toHaveBeenCalled();
   });
  });
});

describe("family application authorized retry", () => {
  const existing = {
    applicationId:"existing-application", householdId:"household",
    studentProfileId:"student", submittedByPersonId:"actor", programId:"program", metadata: {},
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
    selectRows([pool], [year], [{id:"expired-offer",applicationId:"application",expiresAt:new Date("2020-01-01T00:00:00Z"),metadata:{synthetic:true}}]);
    await expect(expireSyntheticAdmissionOffers(registrarContext,{programId:"program",schoolYearId:"year"})).resolves.toBe(1);
    expect(update).toHaveBeenCalled();
    expect(values).toHaveBeenCalledWith(expect.objectContaining({action:"admissions.offer.expire",resourceId:"expired-offer"}));
  });

  it("emits offer issuance alongside audit", async () => {
    selectRows([application], [pool], [year], [], [], [], [journey], [], [], [], [{personId:"student-person"}], [{personId:"guardian-person",canManageEnrollment:true,metadata:{verification:"verified"}}]);
    await expect(issueSyntheticAdmissionOffer(registrarContext, input)).resolves.toBe("created");
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "AdmissionOfferIssued", aggregateId: "created",
    }));
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ action: "admissions.offer.issue" }));
    expect(values).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({recipientPersonId:"guardian-person",type:"admission_offer_issued",resourceId:"created"})]));
  });

  it("rejects an expired offer on the idempotency retry path", async () => {
    selectRows([application], [pool], [year], [],
      [{...offer,idempotencyKey:"key",expiresAt:new Date("2020-01-01T00:00:00Z")}]);
    await expect(issueSyntheticAdmissionOffer(registrarContext,input)).rejects.toThrow(/expired|no longer actionable/);
    expect(values).not.toHaveBeenCalled();
  });

  it("rejects a second live offer with a different idempotency key", async () => {
    selectRows([application], [pool], [year], [], [],
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
    selectRows([{ ...application, metadata: { synthetic: false } }], [pool], [year], [], [], [], [journey], [], [], [], [{personId:"student-person"}], [{personId:"guardian-person",canManageEnrollment:true,metadata:{verification:"verified"}}]);
    await expect(issueSyntheticAdmissionOffer(registrarContext, input)).resolves.toBe("created");
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ action: "admissions.offer.issue" }));
  });

  it("refuses to reissue a declined offer under the same idempotency key", async () => {
    selectRows([application], [pool], [year], [], [{ ...offer, status: "declined" }]);
    await expect(issueSyntheticAdmissionOffer(registrarContext, input)).rejects.toThrow("no longer actionable");
    expect(values).not.toHaveBeenCalled();
  });

  it("allows a guardian response on a live (non-synthetic) application", async () => {
    selectRows([offer], [pool], [year], [offer], [{ ...application, metadata: { synthetic: false } }],
      [{ personId: "student-person" }], [{id:"relationship",canManageEnrollment:true,metadata:{verification:"verified"}}], [journey], []);
    await expect(respondToSyntheticAdmissionOffer(guardianContext, "offer", "accept")).resolves.toBe("offer");
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "AdmissionOfferAccepted", aggregateId: "offer",
    }));
  });

  it("allows activating a live (non-synthetic) accepted application", async () => {
    selectRows([offer], [pool], [year], [{ ...offer, status: "accepted", respondedAt: new Date("2026-10-01T00:00:00Z"),respondedByPersonId:"guardian-person" }],
      [{ ...application, metadata: { synthetic: false }, stage: "accepted" }], [{personId:"student-person"}],
      [{id:"relationship",canManageEnrollment:true,metadata:{verification:"verified"}}], [], [journey], [], [], [], [{personId:"student-person"}]);
    await expect(activateSyntheticOfferedEnrollment(registrarContext, "offer")).resolves.toBe("created");
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "EnrollmentActivated", aggregateId: "created",
    }));
  });

  it("refuses issuance when the seat pool is full", async () => {
    selectRows([application], [{ capacity: 1 }], [year], [], [], [], [journey], [],
      [{ studentId: "already-enrolled" }], []);
    await expect(issueSyntheticAdmissionOffer(registrarContext, input)).rejects.toThrow("Seat pool is full");
    expect(values).not.toHaveBeenCalled();
  });

  it("refuses issuance with an outstanding blocking requirement", async () => {
    selectRows([application], [pool], [year], [], [], [], [journey],
      [{ status: "needs_you" }]);
    await expect(issueSyntheticAdmissionOffer(registrarContext, input)).rejects.toThrow("Blocking requirements remain");
    expect(values).not.toHaveBeenCalled();
  });

  it("refuses issuance before the enrollment journey is ready", async () => {
    selectRows([application], [pool], [year], [], [], [], [{ ...journey, status: "in_progress" }]);
    await expect(issueSyntheticAdmissionOffer(registrarContext, input)).rejects.toThrow("Enrollment Journey must be ready");
    expect(values).not.toHaveBeenCalled();
  });

  it("denies guardian acceptance without a managing relationship", async () => {
    selectRows([offer], [pool], [year], [offer], [application],
      [{ personId: "student-person" }], []);
    await expect(respondToSyntheticAdmissionOffer(guardianContext, "offer", "accept")).rejects.toThrow("Guardian is not authorized");
    expect(values).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("does not emit another event for an issuance retry", async () => {
    selectRows([application], [pool], [year], [], [offer]);
    await expect(issueSyntheticAdmissionOffer(registrarContext, input)).resolves.toBe("offer");
    expect(values).not.toHaveBeenCalled();
  });

  it.each(["accept", "decline"] as const)("emits the %s transition", async (action) => {
    const issuedOffer={...offer,issuedByPersonId:"registrar-person"};
    selectRows([issuedOffer], [pool], [year], [issuedOffer], [application], [{ personId: "person" }], [{id:"relationship",canManageEnrollment:true,metadata:{verification:"verified"}}]);
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
    expect(values).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({recipientPersonId:"registrar-person",type:action==="accept"?"admission_offer_accepted":"admission_offer_declined",resourceId:"offer"})]));
  });

  it("does not activate an accepted offer missing a guardian response timestamp", async () => {
    selectRows([offer], [pool], [year], [{ ...offer, status: "accepted", respondedAt: null }]);
    await expect(activateSyntheticOfferedEnrollment(registrarContext, "offer")).rejects.toThrow("Accepted offer must record a guardian response");
    expect(values).not.toHaveBeenCalled();
  });

  it("does not activate an accepted offer missing the accepting guardian identity",async()=>{
    selectRows([offer],[pool],[year],[{...offer,status:"accepted",respondedAt:new Date()}]);
    await expect(activateSyntheticOfferedEnrollment(registrarContext,"offer")).rejects.toThrow("record a guardian response");
    expect(values).not.toHaveBeenCalled();
  });

  it("rechecks the accepting guardian's relationship before activation and retries",async()=>{
    selectRows([offer],[pool],[year],[{...offer,status:"accepted",respondedAt:new Date(),respondedByPersonId:"former-guardian"}],
      [{...application,stage:"accepted"}],[{personId:"student-person"}],[]);
    await expect(activateSyntheticOfferedEnrollment(registrarContext,"offer")).rejects.toThrow("Guardian is not authorized");
    expect(values).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("emits activation and audits the Journey transition", async () => {
    selectRows([offer], [pool], [year], [{ ...offer, status: "accepted", respondedAt: new Date("2026-10-01T00:00:00Z"),respondedByPersonId:"guardian-person" }],
      [{ ...application, stage: "accepted" }], [{personId:"student-person"}],[{id:"relationship",canManageEnrollment:true,metadata:{verification:"verified"}}], [], [journey], [], [], [], [{personId:"student-person"}]);
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
    selectRows([offer], [pool], [year], [{ ...offer, status: "accepted", respondedAt: new Date("2026-10-01T00:00:00Z"),respondedByPersonId:"guardian-person" }],
      [{ ...application, stage: "accepted" }], [{personId:"student-person"}],[{id:"relationship",canManageEnrollment:true,metadata:{verification:"verified"}}], [{ id: "existing" }]);
    await expect(activateSyntheticOfferedEnrollment(registrarContext, "offer")).resolves.toBe("existing");
    expect(values).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("also allows legacy activation retries after the Journey becomes active", async () => {
    selectRows([{ ...application, stage: "accepted" }], [], [year],
      [{ ...journey, status: "active" }], [{ id: "existing" }]);
    await expect(activateEnrollmentFromApplication(context, "application", "year")).resolves.toBe("existing");
    expect(values).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("does not create a new legacy enrollment without Journey readiness", async () => {
    selectRows([{ ...application, stage: "accepted" }], [], [year],
      [{ ...journey, status: "in_progress" }], []);
    await expect(activateEnrollmentFromApplication(context, "application", "year")).rejects.toThrow("ready");
    expect(values).not.toHaveBeenCalled();
  });
});

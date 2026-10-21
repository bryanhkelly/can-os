import { selectActionableOffer } from "@/domain/admissions-offer-selection";

export type AdmissionsStepOwner = "family" | "registrar";
export type AdmissionsStepKey =
  | "submit" | "eligibility" | "verify-guardian" | "provision-guardian" | "requirements"
  | "approve" | "issue-offer" | "family-accepts" | "activate" | "place";
export type AdmissionsStep = { key: AdmissionsStepKey; title: string; owner: AdmissionsStepOwner; done: boolean };
export type AdmissionsProgressInput = {
  stage: string;
  disposition: string | null;
  submitted: boolean;
  journeyStarted: boolean;
  guardianVerified: boolean;
  guardianLoginProvisioned: boolean;
  outstandingRequirements: number;
  offers: { id: string; status: string; expiresAt: string | null; schoolYearId: string }[];
  activeEnrollments: number;
  placedSections: number;
};
export type AdmissionsProgress = {
  status: "closed" | "waitlisted" | "in_progress" | "complete";
  steps: AdmissionsStep[];
  next: AdmissionsStep | null;
};

/** Derives the ordered registrar/family admissions checklist from persisted application state. */
export function admissionsProgress(x: AdmissionsProgressInput, now: Date = new Date()): AdmissionsProgress {
  const live = selectActionableOffer(x.offers, now);
  const accepted = x.offers.some(o => o.status === "accepted") || x.stage === "accepted";
  const offered = accepted || live?.status === "issued";
  const enrolled = x.activeEnrollments > 0;
  const reviewStarted = x.journeyStarted || ["eligibility", "accepted"].includes(x.stage);
  const steps: AdmissionsStep[] = [
    { key: "submit", title: "Family submits the application", owner: "family", done: x.submitted },
    { key: "eligibility", title: "Begin eligibility review", owner: "registrar", done: reviewStarted },
    { key: "verify-guardian", title: "Verify the guardian relationship", owner: "registrar", done: x.guardianVerified },
    { key: "provision-guardian", title: "Provision guardian sign-in access", owner: "registrar", done: x.guardianLoginProvisioned },
    { key: "requirements", title: "Complete blocking enrollment requirements", owner: "registrar", done: (x.journeyStarted && x.outstandingRequirements === 0) || accepted },
    { key: "approve", title: "Approve for offer", owner: "registrar", done: offered || x.disposition === "ready_for_offer" },
    { key: "issue-offer", title: "Issue an enrollment offer", owner: "registrar", done: offered },
    { key: "family-accepts", title: "Guardian accepts the offer", owner: "family", done: accepted },
    { key: "activate", title: "Activate enrollment", owner: "registrar", done: enrolled },
    { key: "place", title: "Place the student in courses", owner: "registrar", done: x.placedSections > 0 },
  ];
  if (["declined", "withdrawn"].includes(x.stage)) return { status: "closed", steps, next: null };
  const next = steps.find(step => !step.done) ?? null;
  if (x.disposition === "waitlisted") return { status: "waitlisted", steps, next };
  return { status: next ? "in_progress" : "complete", steps, next };
}

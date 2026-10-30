import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { safeguardingObservationSchema } from "@/domain/safeguarding-intake-policy";
import {
  acknowledgeSafeguardingConcern,
  addSafeguardingEvidence,
  assignSafeguardingCaseReview,
  claimOverdueSafeguardingResponse,
  completeSafeguardingCaseReview,
  escalateSafeguardingConcern,
  getSafeguardingCase,
  getSafeguardingWorkspace,
  listOverdueUnacknowledgedSafeguardingCases,
  recordSafeguardingExternalReport,
  resolveSafeguardingConcern,
  saveSafeguardingSiteConfiguration,
  submitSafeguardingConcern,
} from "./safeguarding-service";

const uuid = z.string().uuid();
const incidentInput = z.object({ incidentId: uuid }).strict();
const text = (minimum: number, maximum: number) => z.string().trim().min(minimum).max(maximum);

async function actor() {
  setResponseHeader("Cache-Control", "private, no-store");
  return getCommandContext(getRequest());
}

export const getMySafeguardingWorkspace = createServerFn({ method: "GET" }).handler(async () => {
  return getSafeguardingWorkspace(await actor());
});

export const getAssignedSafeguardingCase = createServerFn({ method: "GET" })
  .validator((value: unknown) => incidentInput.parse(value))
  .handler(async ({ data }) => getSafeguardingCase(await actor(), data.incidentId));

export const reportSafeguardingConcern = createServerFn({ method: "POST" })
  .validator((value: unknown) => {
    const { idempotencyKey, ...observation } = z.object({ idempotencyKey: uuid })
      .passthrough().parse(value);
    return {
      ...safeguardingObservationSchema.parse(observation),
      idempotencyKey,
    };
  })
  .handler(async ({ data }) => submitSafeguardingConcern(await actor(), data));

export const acknowledgeAssignedSafeguardingConcern = createServerFn({ method: "POST" })
  .validator((value: unknown) => incidentInput.parse(value))
  .handler(async ({ data }) => acknowledgeSafeguardingConcern(await actor(), data.incidentId));

export const escalateAssignedSafeguardingConcern = createServerFn({ method: "POST" })
  .validator((value: unknown) => incidentInput.parse(value))
  .handler(async ({ data }) => escalateSafeguardingConcern(await actor(), data.incidentId));

export const resolveAssignedSafeguardingConcern = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    incidentId: uuid,
    resolutionSummary: text(10, 2000),
  }).strict().parse(value))
  .handler(async ({ data }) => resolveSafeguardingConcern(await actor(), data));

export const getOverdueUnacknowledgedSafeguardingCases = createServerFn({ method: "GET" })
  .handler(async () => listOverdueUnacknowledgedSafeguardingCases(await actor()));

export const claimOverdueSafeguardingCaseResponse = createServerFn({ method: "POST" })
  .validator((value: unknown) => incidentInput.parse(value))
  .handler(async ({ data }) => claimOverdueSafeguardingResponse(await actor(), data.incidentId));

export const addRestrictedSafeguardingEvidence = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    incidentId: uuid,
    idempotencyKey: uuid,
    type: z.enum(["observation", "document", "photograph", "other"]),
    description: text(3, 2000),
    documentId: uuid.optional(),
  }).strict().parse(value))
  .handler(async ({ data }) => addSafeguardingEvidence(await actor(), data));

export const recordIndependentSafeguardingExternalReport = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    incidentId: uuid,
    idempotencyKey: uuid,
    status: z.enum(["attempted", "submitted", "agency_acknowledged"]),
    agencyType: z.enum(["emergency_services", "child_welfare", "law_enforcement", "medical", "other"]),
    agencyLabel: text(2, 200),
    channel: z.enum(["phone", "online", "in_person", "formal_notice", "other"]),
    occurredAt: z.string().datetime({ offset: true }).transform(value => new Date(value)),
    reference: text(1, 300).optional(),
    details: text(3, 2000).optional(),
  }).strict().parse(value))
  .handler(async ({ data }) => recordSafeguardingExternalReport(await actor(), data));

export const saveOperationalSafeguardingConfiguration = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    siteId: uuid,
    jurisdictionId: uuid,
    procedureVersion: text(2, 120),
    emergencyInstructions: text(10, 3000),
    externalReportingInstructions: text(10, 4000),
    offlineInstructions: text(10, 3000),
    acknowledgmentDueMinutes: z.number().int().min(5).max(120),
    active: z.boolean(),
    responders: z.object({ primary: uuid, deputy: uuid, can_lead: uuid }).strict(),
  }).strict().parse(value))
  .handler(async ({ data }) => saveSafeguardingSiteConfiguration(await actor(), data));

export const completeAssignedSafeguardingReview = createServerFn({method:"POST"})
  .validator((value:unknown)=>z.object({incidentId:uuid,reviewId:uuid,outcome:text(10,2000)}).strict().parse(value))
  .handler(async({data})=>completeSafeguardingCaseReview(await actor(),data));

export const assignRestrictedSafeguardingReview = createServerFn({method:"POST"})
  .validator((value:unknown)=>z.object({incidentId:uuid,reviewId:uuid,reviewerPersonId:uuid,
    kind:z.enum(["protective_measure_review","external_reporting_review","follow_up_review"]),notes:text(10,2000),
  }).strict().parse(value))
  .handler(async({data})=>assignSafeguardingCaseReview(await actor(),data));

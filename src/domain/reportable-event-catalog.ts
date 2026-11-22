import { z } from "zod";
import { EventTypes } from "@/domain/event-types";
import type { ReportingDimensions, ReportingSourceInput } from "@/domain/reporting-source-contract";

/**
 * A centrally governed set of source-linked operational events.
 * Event-specific allowlists prevent raw PII, draft copy, survey responses,
 * email addresses and other arbitrary fields entering the shared outbox.
 *
 * A new reportable lifecycle event requires a reviewed contract here, an
 * authoritative writer, worker registration and projection tests.
 */
const uuid = z.string().uuid();
const revision = z.number().int().positive();

export const REPORTABLE_EVENT_CATALOG = {
  [EventTypes.SiteInformationUpdated]: {
    sourceKind: "site",
    aggregateType: "site",
    requiredDimensions: ["siteId"] as const,
    payload: z.object({
      section: z.string().trim().min(1).max(80),
      revision: z.string().datetime({ offset: true }),
      selfReported: z.boolean(),
      publicApproved: z.boolean(),
    }).strict(),
  },
  [EventTypes.SiteMarketingPackageCreated]: {
    sourceKind: "site_marketing_package",
    aggregateType: "site_marketing_package",
    requiredDimensions: ["siteId"] as const,
    payload: z.object({ revision }).strict(),
  },
  [EventTypes.SiteMarketingPackageUpdated]: {
    sourceKind: "site_marketing_package",
    aggregateType: "site_marketing_package",
    requiredDimensions: ["siteId"] as const,
    payload: z.object({ revision, previousRevision: revision }).strict()
      .refine(value => value.revision > value.previousRevision,
        "Marketing Package revision must advance"),
  },
  [EventTypes.SiteMarketingPackageReleased]: {
    sourceKind: "site_marketing_package_release",
    aggregateType: "site_marketing_package_release",
    requiredDimensions: ["siteId"] as const,
    payload: z.object({
      packageId: uuid, packageRevision: revision, brandVersionId: uuid,
      formats: z.array(z.string().trim().min(1).max(40)).min(1).max(20),
    }).strict(),
  },
  [EventTypes.SiteMarketingPackageDuplicated]: {
    sourceKind: "site_marketing_package",
    aggregateType: "site_marketing_package",
    requiredDimensions: ["siteId"] as const,
    payload: z.object({ sourcePackageId: uuid, revision }).strict(),
  },
  [EventTypes.SiteMarketingPackageStatusChanged]: {
    sourceKind: "site_marketing_package",
    aggregateType: "site_marketing_package",
    requiredDimensions: ["siteId"] as const,
    payload: z.object({
      previousStatus: z.enum(["draft", "archived"]),
      status: z.enum(["draft", "archived"]),
      previousRevision: revision, revision,
    }).strict().refine(value => value.previousStatus !== value.status &&
      value.revision > value.previousRevision, "Package status revision must advance"),
  },
  [EventTypes.SiteMarketingPackageBrandSelected]: {
    sourceKind: "site_marketing_package",
    aggregateType: "site_marketing_package",
    requiredDimensions: ["siteId"] as const,
    payload: z.object({ brandVersionId: uuid, previousRevision: revision, revision })
      .strict().refine(value => value.revision > value.previousRevision,
        "Brand selection revision must advance"),
  },
  [EventTypes.SiteMarketingPackageDeleted]: {
    sourceKind: "site_marketing_package",
    aggregateType: "site_marketing_package",
    requiredDimensions: ["siteId"] as const,
    payload: z.object({
      lastRevision: revision, lastStatus: z.enum(["draft", "archived"]),
    }).strict(),
  },
  [EventTypes.SiteMarketingArtifactWithdrawn]: {
    sourceKind: "site_artifact_release",
    aggregateType: "site_artifact_release",
    requiredDimensions: ["siteId"] as const,
    payload: z.object({
      withdrawnAt: z.string().datetime({ offset: true }),
    }).strict(),
  },
  [EventTypes.InterestEventCreated]: {
    sourceKind: "interest_event",
    aggregateType: "interest_event",
    requiredDimensions: ["siteId", "programId"] as const,
    payload: z.object({
      calendarEventId: uuid,
      kind: z.enum(["information_session", "open_house", "campus_tour", "family_experience", "other"]),
      visibility: z.enum(["public", "invitation_only"]),
    }).strict(),
  },
  [EventTypes.InterestEventRegistrationCreated]: {
    sourceKind: "interest_event_registration",
    aggregateType: "interest_event_registration",
    requiredDimensions: ["siteId", "programId"] as const,
    payload: z.object({
      eventId: uuid, publicInterestId: uuid,
      emailDeliveriesQueued: z.array(z.string().trim().min(1).max(80)).max(12),
    }).strict(),
  },
  [EventTypes.InterestEventAttendanceRecorded]: {
    sourceKind: "interest_event_registration",
    aggregateType: "interest_event_registration",
    requiredDimensions: ["siteId", "programId"] as const,
    payload: z.object({
      eventId: uuid, attendanceStatus: z.enum(["attended", "no_show"]),
    }).strict(),
  },
  [EventTypes.SiteRoomCreated]: {
    sourceKind: "site_room",
    aggregateType: "site_room",
    requiredDimensions: ["siteId"] as const,
    payload: z.object({ capacity: z.number().int().positive() }).strict(),
  },
  [EventTypes.SiteRoomUpdated]: {
    sourceKind: "site_room",
    aggregateType: "site_room",
    requiredDimensions: ["siteId"] as const,
    payload: z.object({
      capacity: z.number().int().positive(), revision,
    }).strict(),
  },
  [EventTypes.SiteRoomRetired]: {
    sourceKind: "site_room",
    aggregateType: "site_room",
    requiredDimensions: ["siteId"] as const,
    payload: z.object({
      retiredAt: z.string().datetime({ offset: true }), revision,
    }).strict(),
  },
} as const;

export type ReportableEventType = keyof typeof REPORTABLE_EVENT_CATALOG;
export type ReportableSourceKind =
  (typeof REPORTABLE_EVENT_CATALOG)[ReportableEventType]["sourceKind"];
export type ReportableEventInput = {
  [T in ReportableEventType]: {
    eventType: T;
    aggregateType: (typeof REPORTABLE_EVENT_CATALOG)[T]["aggregateType"];
    aggregateId: string;
    actorPersonId?: string | null;
    source: ReportingSourceInput["source"] & {
      kind: (typeof REPORTABLE_EVENT_CATALOG)[T]["sourceKind"];
    };
    dimensions: ReportingDimensions;
    evidenceClass: "operational_record";
    occurredAt: Date;
    correctsEventId?: string | null;
    payload: z.input<(typeof REPORTABLE_EVENT_CATALOG)[T]["payload"]>;
  };
}[ReportableEventType];

export function validateReportableEvent(
  event: { eventType: string; aggregateType: string; source: { kind: string; id: string };
    aggregateId: string; dimensions: ReportingDimensions;
    evidenceClass: string; payload: unknown },
): Record<string, unknown> {
  if (!Object.hasOwn(REPORTABLE_EVENT_CATALOG, event.eventType)) {
    throw new Error("Unregistered reportable event type");
  }
  const spec = REPORTABLE_EVENT_CATALOG[event.eventType as ReportableEventType];
  if (event.aggregateType !== spec.aggregateType ||
      event.source.kind !== spec.sourceKind ||
      event.aggregateId !== event.source.id ||
      event.evidenceClass !== "operational_record") {
    throw new Error("Event type, authoritative source and evidence class disagree");
  }
  // A Program caller may be authorized to edit a shared Site resource,
  // but that does not make the resource Program-owned.
  const requiredDimensions: readonly string[] = spec.requiredDimensions;
  if (!requiredDimensions.includes("programId") && event.dimensions.programId != null) {
    throw new Error("Site-owned reporting source cannot be attributed to an operating Program");
  }
  for (const name of spec.requiredDimensions) {
    if (typeof event.dimensions[name] !== "string" || !event.dimensions[name]) {
      throw new Error("Required reporting dimension is missing: " + name);
    }
  }
  return spec.payload.parse(event.payload) as Record<string, unknown>;
}

import { EventTypes } from "@/domain/event-types";
import { REPORTABLE_EVENT_CATALOG, type ReportableEventType } from "@/domain/reportable-event-catalog";

/**
 * Reusable module instrumentation inventory. Existing domain sources remain
 * authoritative; "partial" only means THESE named events are normalized.
 * Never promote a domain to fully reportable based solely on event receipts.
 */
export type ReportingDomainCoverage = {
  domain: string;
  owner: string;
  state: "instrumented_subset" | "domain_metrics_only" | "not_connected";
  instrumentedEvents: readonly ReportableEventType[];
  missingLifecycleExamples: readonly string[];
};

export const REPORTING_DOMAIN_COVERAGE: readonly ReportingDomainCoverage[] = [
  {
    domain:"launch_studio",owner:"Site setup and Launch Studio",
    state:"instrumented_subset",
    instrumentedEvents:[EventTypes.SiteInformationUpdated],
    missingLifecycleExamples:["Program/Solution activation", "readiness approval",
      "Site opening and compliance decisions"],
  },
  {
    domain:"introduce",owner:"Marketing Packages and Interest Events",
    state:"instrumented_subset",
    instrumentedEvents:[
      EventTypes.SiteMarketingPackageCreated,
      EventTypes.SiteMarketingPackageUpdated,
      EventTypes.SiteMarketingPackageReleased,
      EventTypes.SiteMarketingPackageDuplicated,
      EventTypes.SiteMarketingPackageStatusChanged,
      EventTypes.SiteMarketingPackageBrandSelected,
      EventTypes.SiteMarketingPackageDeleted,
      EventTypes.SiteMarketingArtifactWithdrawn,
      EventTypes.InterestEventCreated,
      EventTypes.InterestEventRegistrationCreated,
      EventTypes.InterestEventAttendanceRecorded,
    ],
    missingLifecycleExamples:["actual email distribution", "delivery confirmation",
      "verified conversion attribution"],
  },
  {
    domain:"facilities",owner:"Site room operations",
    state:"instrumented_subset",
    instrumentedEvents:[EventTypes.SiteRoomCreated,EventTypes.SiteRoomUpdated,
      EventTypes.SiteRoomRetired],
    missingLifecycleExamples:["Class room assignment", "utilization denominator",
      "compliance inspection outcome"],
  },
  {
    domain:"noncredit_learning",owner:"Existing noncredit participation and completion authority",
    state:"domain_metrics_only",instrumentedEvents:[],
    missingLifecycleExamples:["participant identity reconciliation",
      "verified attendance decision", "completion correction and unique participant reporting"],
  },
  {
    domain:"native_classes",owner:"Existing Class and Classroom Connect authority",
    state:"domain_metrics_only",instrumentedEvents:[],
    missingLifecycleExamples:["Class/session attendance decisions",
      "learning assessments", "transfers and withdrawals"],
  },
  {
    domain:"experiences",owner:"Experience offerings and enrollments",
    state:"not_connected",instrumentedEvents:[],
    missingLifecycleExamples:["offering authorization", "attendance",
      "participant capacity", "outcome decision"],
  },
  {
    domain:"partnerships_funding",owner:"Funding agreements and sponsored initiatives",
    state:"not_connected",instrumentedEvents:[],
    missingLifecycleExamples:["funding agreement approval", "deliverable evidence",
      "funded outcome and sponsor disclosure"],
  },
];

/** One authoritative governed event must have exactly one reporting owner. */
export function assertReportingCoverageCatalogComplete(): void {
  const assigned=REPORTING_DOMAIN_COVERAGE.flatMap(m=>[...m.instrumentedEvents]);
  const unique=new Set(assigned);
  const catalog=Object.keys(REPORTABLE_EVENT_CATALOG);
  if(unique.size!==assigned.length || unique.size!==catalog.length ||
     catalog.some(eventType=>!unique.has(eventType as ReportableEventType))) {
    throw new Error("Reporting event catalog and module coverage must reconcile exactly");
  }
}

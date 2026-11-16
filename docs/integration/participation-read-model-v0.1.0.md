# Participation Read Model Contract (PRM) v0.1.0

**Status:** PROVISIONAL, for WS1 ratification before dependent implementations.  
**Owners:** WS1 (schema/type and personal read service), WS00 (integration approval).  
**Baseline:** `main@5e50d26c197330b3f01403c221f6646f8cbef823` (2026-11-16).  
**Consumers:** WS2, WS3, WS4, WS5, WS6, My Activity and authorized reporting.

## Purpose and authority

One *person-centered read projection*, **not** another enrollment or learning ledger. The canonical `education_v30` authorities remain the only writers of Class Enrollment, school Enrollment, noncredit Registration, Course Attempt, attendance, assessment, grades, completion, credential and attribution. Existing enrichment/guardian systems are read through their own approved services until formally migrated. Do not reimplement these authorities in the read model.

Existing sources on baseline:
- `src/modules/learning/canonical-course-participation.server.ts`, `src/domain/canonical-course-participation.ts`, `src/domain/native-class-enrollment.ts`
- `src/db/canonical-v301/noncredit.ts`, `src/routes/learn.my-programs.tsx`
- `docs/architecture/network-attribution-reporting.md`, `database/canonical/v3.0.1/SCHEMA-OWNERSHIP.md`
- `docs/product/classroom-connect-reporting-contract.md`

## Contract shape, proposed

```ts
type ParticipationSource =
  | "native_class_enrollment" | "school_enrollment"
  | "noncredit_registration" | "family_enrichment_registration";

type ParticipationState =
  | "pending" | "registered" | "active" | "completed"
  | "withdrawn" | "cancelled";

type ParticipationRecordV1 = {
  contractVersion: "0.1.0";
  sourceKind: ParticipationSource;
  sourceId: string; // actual authoritative source-row UUID
  personId: string; // resolved from verified principal or independently authorized guardian relation
  courseAttemptId: string | null; // reference ONLY, no invented attempts
  classId: string | null;
  sectionId: string | null;
  deploymentId: string | null;
  adoptionId: string | null;
  offeringVersionId: string | null;
  courseVersionId: string | null;
  enrollmentReleaseId: string | null;
  operatorOrganizationId: string | null;
  actualDeliverySiteId: string | null;
  creditedOrganizationId: string | null; // from immutable, authorized attribution only
  networkId: string | null; // optional scoped reporting context, never an authorization grant
  reportingUnitId: string | null;
  state: ParticipationState;
  sourceState: string; // preserve canonical original
  startsAt: string | null; // ISO 8601 UTC, from authoritative schedule
  endsAt: string | null;
  completedAt: string | null; // only from authorized formal decision
  completionDecisionId: string | null;
  certificateId: string | null;
  lastEvidenceAt: string | null; // not official attendance
  projectionAsOf: string; // query snapshot time
};
```

The natural identity is `(sourceKind, sourceId)`, **not** `(personId, courseVersionId)`. A Course Attempt belongs to its authoritative enrollment or registration; it is not a new enrollment. When one enrollment legitimately covers multiple Course Attempts, return separate **nested course experiences** under a single participation record (or a separate child read model) rather than duplicate the enrollment count. Family enrichment must never be given a synthetic canonical attempt or completion.

### Identity and status mapping

| Canonical source | Participation identity | Status mapping |
| --- | --- | --- |
| `education_v30.class_enrollments` | native Class Enrollment ID | pending / active / completed / withdrawn / cancelled map directly |
| `education_v30.enrollments` | school Enrollment ID | pending / active / completed / withdrawn / cancelled map directly |
| `education_v30.noncredit_registrations` | noncredit Registration ID | registered / active / completed / withdrawn / cancelled map directly |
| Existing guardian enrichment registration | its actual registration ID | only mapped after WS1 confirms source enum and service; source status preserved |

`planned`, `active`, `completed`, `withdrawn` on a Course Attempt are **not replacements for source enrollment state**. A waitlist position or 48-hour invitation is an *opportunity* in a separate enrollment-lifecycle read view, not participation. An expired invitation is not cancellation of a learner Enrollment. Status, successful participation, attendance and official completion are separate concepts.

### Organization, Site and network

- `operatorOrganizationId` identifies the effective approved operator, not the Site host or the optional affiliate.
- `actualDeliverySiteId` is the authorized canonical physical/mobile/virtual Site where the published release or activated Class is attached. For a verified published release or activated native Class this must be non-null. Older source rows may have missing Sites; mark projection unavailable/needs reconciliation, **do not fabricate a Site or silently fill null**.
- `creditedOrganizationId`, `networkId`, `reportingUnitId` are optional and come from immutable `participation_attributions` snapshots and current independently authorized reporting grants. Affiliate identifiers map to canonical memberships; they never replace UUIDs or prove personal church membership.
- Network affiliation and favorite Sites do not authorize access. Current effective-dated Organization/Site relationships, legal learner/guardian ties, explicit scope grants, and RLS must all be checked for every request.

### Security and read boundaries

A person may view their own permitted participation. A guardian may view only individually authorized dependents and fields appropriate to that relationship; staff see only explicitly scoped records for approved roles, Organizations, Sites, Operations, and authorized time windows. Cross-Site/org/network reads require independent effective grants and appropriate aggregation or consent. Never make a generalized cross-tenant view or client-selectable `personId` an access bypass. Separate **historical metadata access** from **current course/material access**. A verified person may see eligible past participation, withdrawal or completion history according to retention and ownership rules even when the release is closed; this does NOT authorize reopening learning materials or taking assessments. A guardian sees only periods and records covered by the applicable verified legal relationship/policy. Do not reuse an active-only Course Attempt authorization as the sole history read gate. Preserve staff/network permission revocation and fail closed on unavailable proof. Avoid cached authorizations on viewer role switches. Restricted assessment responses, safeguarding, staff records, financial and survey personal details must never enter this projection.

### Canonical navigation and historical read semantics

The preferred person-centered entry is **My Activity** at \`/learn/activity\`, with sections for current participation, upcoming sessions, history and results. Preserve compatible redirects or links from \`/learn/my-programs\`, \`/learn/my-courses\` and existing \`/learn/classes\` as appropriate; do not delete working deep links. WS1 owns these learner routes; WS00 reviews the navigation integration and 6.1 design-system consistency. A completed or withdrawn participation can remain visible as historical metadata without conveying continued access to protected course content.

### Event and evidence semantics

The view derives state from canonical rows and append-only events, not from its own writable state machine. WS1 must document exact source event codes after confirming code/DDL; initial conceptual events include enrollment/registration created or activated, seat withdrawn or released, invitation sent/expired (opportunity only), session scheduled/started, facilitator attendance attested/corrected, assessment finalized, and completion decided/voided/revoked. Every emitted feed item needs source kind, authoritative source id, source event/decision id, source timestamp, and stable deduplication key. Corrections supersede or reconcile records; history remains auditable. A viewer timeline must never promote pairing, video controls, device presence, survey response, knowledge-check pass or lesson clicks into official attendance, credit, completion, or certification.

### Reporting semantics

Maintain separate measures: *unique participants* by eligible identity/person, *registrations/enrollments* by source identity, *Course Attempts* by attempt ID, *scheduled sessions*, *delivered sessions*, *verified attendance* by authorized host assertions, *finalized assessments*, *formal completions* by latest valid decision, *certificates issued/revoked*, and *credits earned* by existing official authority. Each measure has denominator, evidence source, as-of time and metric definition version. Deduplicate within source scope before grouping by Site, operator or network. Network hierarchy rollups are **not additive** across levels and may count one person's participation in more than one independently enrolled program; avoid counting the same registration twice. Published metrics need disclosure controls beyond a fixed small-cell threshold; provider-private reporting still requires data-rights checks.

## WS1 ratification gate

Before WS2–WS6 consume this:
1. Confirm all real schema/table names, relationships, status enums and existing authorization services.
2. Publish a typed versioned DTO, event mapping, test fixtures and additive-compatible evolution policy; classify provisional fields if their sources do not yet exist.
3. Provide at least: adult self-paced noncredit, native facilitated Class, school Section, guardian enrichment, cross-Site unauthorized, historical withdrawal and completion supersession fixtures.
4. Record review approval from WS00; breaking changes require an explicit contract version bump and consumer review.

**Change policy:** compatible optional additions within v0.x may be proposed through a coordinated PR; changed authority, ID semantics, security or metric definitions require WS00 review before merging. This document is a proposed shared interface, **not evidence that the runtime implements it**.

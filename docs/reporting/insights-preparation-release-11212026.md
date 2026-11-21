# Insights preparation: existing-module upgrades on release-11212026

This is a pre-integration slice on the active release branch, not a new
Insights product branch. It makes current reporting services easier to reuse
after release-11212026 is integrated into main.

## Code changes in this slice

- Class and noncredit operator CSV exports now use a shared serializer that
  protects against spreadsheet formula injection in source-authored text.
  Non-finite numeric results fail rather than silently becoming report values.
- The Class export carries stable metric IDs, explicit unavailable status,
  source, denominator, counting rule, time basis, UTC window, as-of timestamp,
  contract version and private classification. A governed metric with no
  authority remains unavailable, not a numeric zero.
- Noncredit pilot outcomes have shared metric definitions, including source,
  grain, counting rule and time basis. The existing pilot UI uses the same
  definitions and exposes them alongside its operational counts.
- Pilot reporting displays the end-exclusive UTC window instead of describing
  the exclusive end date as an inclusive "through" date.
- Tests cover CSV formula safety and pilot metric contract integrity.

This slice does not create new Person/Enrollment/Participation tables, a
dashboard engine, a warehouse, an event store, a permission shortcut or a
public impact-publishing endpoint. Existing server-side scopes remain
authoritative.

## Mapping for full Insights implementation

| Existing module | Reporting source / candidate reuse | Known dependency |
| --- | --- | --- |
| Native Class | participation-reporting.ts and native-class-report.functions.ts | Ratified formal Class completion and waitlist authority |
| Noncredit operator | noncredit-network-report.functions.ts | Source-period historical projection; cross-host grant isolation |
| Pilot outcomes | noncredit-pilot-outcomes.functions.ts and domain definitions | Quality/status contract and report snapshots |
| Classroom Connect | Room sessions and latest host-attested attendance | Delivered Session and separate official roll-call definitions |
| Introduce | Marketing Packages, pinned Brand/release artifacts, existing invitations | Durable distribution, response and consent-aware attribution |
| Experiences | Solution/Offering/Experience authorities | Activity-specific participation and outcome evidence |
| Launch Studio | Site preferences, readiness and qualification evidence | Versioned Measurement Plan bindings at Prepare/Solution level |
| Networks | immutable participation_attributions and network_reporting_grants | Verified reader identity, independently authorized host/metric grants |
| Funding | canonical source, allocation and initiative metrics | Approved deliverable-to-measurement requirement mapping |

## Integration sequence

1. Reconcile canonical Person, Site, source lifecycle and effective-dated
   grants against the actual target database. Do not infer missing identities.
2. Confirm authoritative operational source coverage and add evidence contracts
   only where existing services cannot support the required metrics.
3. Ratify reusable Measurement Plan versions and attach them to Solutions or
   Initiatives without creating an extra Launch Studio wizard.
4. Implement scoped Postgres reporting projections, governed metric versions,
   freshness/quality states and a shared read/query service.
5. Build the V6.1 Insights experience on the integrated main baseline.

## Required merge evidence

Before merging release-11212026, validate the **exact branch head** with
source/build/typecheck, reporting unit tests, schema/role isolation and
Cloudflare target build. GitHub Actions startup failures and Cloudflare check
failures do not count as passing verification. No production database writes
or report publication rights are authorized by this document.

# CAN OS Public Sites, Family Interest, and Admissions

**Status:** Canonical product contract. Source boundaries inspected on `main` on November 7, 2026. This document defines intended behavior and known source ownership, **not** evidence that the full family journey, public hosting, or legal authority has passed release acceptance.

## One institution, one connected journey

A church or local host can operate a branded school website while CAN retains academic and school-of-record authority under the applicable institution, Program and jurisdiction. A published website is the *front door* to a real school, not an alternate SIS, admissions system, guardian identity, enrichment ledger, curriculum database or financial system.

The target journey is:

1. Authorized partner creates a minimal Site profile and a **private** school website draft.
2. Site Admin edits local school/community copy and chooses a website template and approved photographs.
3. Authorized publication exposes only reviewed Site information and independently approved Program/Enrichment listings.
4. A visitor explores a school or Program, gives explicit adult contact consent where applicable, and can express interest or begin an independently authorized family application.
5. The family uses verified identity, household/guardian relationships and the existing canonical admissions workflow.
6. An authorized registrar issues an offer. A verified guardian accepts or declines. Enrollment activation checks actual Program, year, capacity, Section and school authorization.
7. The same enrolled student and Program connect onward to teaching, recorded learning, grades, guardian access and on-site supervised operations.

These steps are different business decisions. A request to be contacted is not an Application. An Application is not an offer. An accepted offer is not itself an activated Enrollment, Section assignment or right to begin school.

## Authority and public information boundaries

| Public concern | Owning record / decision | Independent constraint |
| --- | --- | --- |
| School site identity and web address | Canonical Site and Site publication | Scoped Site publisher authority, address uniqueness |
| Church welcome, local mission, statement of faith | Versioned Site-owned local content | Verified Site Admin/editor grant, rights, unsafe content controls |
| Denominational identity | Approved church/network relationship and local copy | A standalone host is not automatically network-governed |
| Grades, curriculum, credit, diploma, provider, academic status | Program/institutional academic authority | Never infer school-of-record or accreditation status from marketing |
| Tuition, aid, school year, services and operating claims | Finance, program, operations and qualified legal sources | Withhold until the relevant public claim is explicitly approved and current |
| Staff/student photographs and personal stories | Canonical Documents and authorized published content | Rights, safeguarding, child-subject release and independent consent |
| Enrichment registration | Existing Season/Registration workflow | Window, consent, package, capacity and payment rules |
| Family interest | Scoped public inquiry and its authorized follow-up | Adult consent, abuse controls, privacy and retention rules |
| Application start | Canonical published family-start eligibility | Verified email and identity; real admission/Program gates |
| Offers and enrollment | Existing admissions offer and enrollment services | Registrar/guardian authorization, seat, Section and audit checks |

The parent-facing public claim inventory is [Parent Information Contract](../parent-experience/parent-information-contract.md). Do not supply convenient placeholder claims for anything missing: show nothing, or explain that official details are not configured.

## Publication is not opening authority

Keep separate state for:
- Website reservation and private draft
- Locally published Site copy
- Institutionally approved public academic/financial/regulatory claims
- Program listing and permitted Apply/interest CTA
- Public HTTPS host/DNS/TLS reachability
- Real-school operational and legal approval

A Site may publish local content before opening a school if authorized, but that cannot turn on enrollment or academic credentials. An existing published website must not be silently unpublished because a new draft or protected claim requires review. Unpublishing or revoking an offering must prevent *new* public entry without deleting lawful existing family/application records.

## Site Admin autonomy and institutional accountability

Local community and religious expression should be editable by a properly scoped Site Admin without routing every ordinary sentence through a CAN editorial queue. Only text making protected institutional, financial, regulatory, academic or affiliation claims should require qualified independent review; unsafe material or student-private data should be rejected, not published.

Publishing changes preserve revision history, conflict checks, accountable author and audit/domain-event evidence. Website authoring, preview and rendering reuse one owned implementation. The family site and the school operations application must use the same canonical Site, Program and identity relationships.

## Source map observed

- Site publication and review: `src/modules/sites/site-publication.server.ts`, `src/modules/sites/site-local-content.server.ts`
- Public-safe site content: `src/domain/public-site-catalog.ts`, `src/domain/public-site-html.ts`
- Host isolation and routing: `src/domain/public-site-host-routing.ts`, `src/domain/public-site-address.ts`
- Verified family start: `src/modules/enrollment/public-family-start.server.ts`, `src/modules/enrollment/public-family-redeem.server.ts`
- Offers and activation: `src/modules/enrollment/admissions-offer-service.ts`, `src/modules/enrollment/admissions-offer.functions.ts`
- Published program claims: `src/domain/academic-program-publication.ts` and program publication services
- Website and media: [Website Studio](WEBSITE-STUDIO.md), [Website Media](WEBSITE-MEDIA.md)

The identified files show scoped services and state separation. They do not certify complete end-to-end wiring, approved deployed hostnames, safe external traffic, or production-ready policy.

## Open product capabilities to verify or complete

These are *requirements and reconciliation items*, not assertions that the October backlog's status still applies:

1. A verified, convenient Site Admin publishing delegation and exact-Site invitation workflow.
2. A complete public Site with verified contact, school information, trustworthy Program/tuition disclosures and accessible templates.
3. Family interest-to-verified-application linkage with safe **existing household/guardian reuse**, preventing email/name collisions from granting a new relationship.
4. Inquiry ownership, adult-contact consent evidence, opt-out and follow-up work in the shared Action/Communication system.
5. Site-specific school-year availability and real tour/interest-event visibility, with no fabricated booking slots or admissions openings.
6. Approved enrichment registration/waitlist entry using the existing registration and payment flow.
7. Address rename, withdrawal, cancellation, revocation, and closed-Site lifecycle affecting all public entry points consistently.
8. Privacy-scoped family acquisition and conversion reporting derived only from canonical Program, Application and Enrollment records.
9. Reusable network templates without cross-Site transfer of private family, staff or academic records.
10. External host validation and pre-production acceptance gates, independently maintained in [Public Site Release Gates](../quality/PUBLIC-SITE-RELEASE-GATES.md).

## Acceptance journey

Run as a real authorized Site Admin, anonymous visitor, guardian, registrar, student, teacher and local operator with separate verified sessions and a disposable test database. Check the same Site/Program at each stage, correct refusals, multi-Site isolation, refresh/idempotency, public-data minimization, event/audit records, and rejected or withdrawn claims.

Do **not** mark any path complete merely because a route, database table, historical FullFlow bite, demo person or test declaration exists.

## Historical and active references

- [School Launch and Run](LAUNCH-AND-RUN.md)
- [Website Studio](WEBSITE-STUDIO.md)
- [Parent Information Contract](../parent-experience/parent-information-contract.md)
- [Admissions Offers](../admissions-offers.md)
- [Public tenant hosting operational runbook](../public-tenant-hosting-release.md)
- [Public Site Release Gates](../quality/PUBLIC-SITE-RELEASE-GATES.md)
- [Historical FullFlow public-site admissions backlog](../archive/2026-11-fullflow/retired-plans/public-site-admissions-remaining-work.md)
- [Historical FullFlow site-publishing implementation journal](../archive/2026-11-fullflow/retired-plans/site-public-publishing.md)

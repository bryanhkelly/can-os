# Site-owned enrollment-driven websites

Source implementation: `main` on November 16, 2026. **A source commit is not proof of build, deployment, or signed-in end-to-end acceptance.**

## Product rule

A Site website is a read-only presentation of independently authorized learning and enrollment data. The active Offering/Program/Course/Class and its governed enrollment release determine what can be described and what visitors can do. A Site's visual template determines presentation, not data ownership.

Do not create a new enrollment-write API, duplicate the Course, infer student/guardian access, or assume that a Program, Course, or Class is available for self-registration merely because it is publicly listed.

## Four enrollment targets

| Public target | Source | Public action |
| --- | --- | --- |
| School / academic Program | Independently reviewed academic marketing record and positive, current family-start eligibility | Apply only when `applicationOpen` is verified; otherwise explore academics |
| Community / enrichment Program | Published Site enrichment catalog with separately checked registration window and capacity | Link to the existing exact Season detail/guardian registration journey when open; otherwise informational or closed |
| Independent Course | Current approved, published noncredit enrollment release linked to the Site | Register by verified release ID, join existing waitlist when allowed, or show closed |
| Scheduled / facilitated / self-paced Class | Native Class with active Site and a separate published public Class Offering | Explore exact Class through filtered native Class directory; the enrollment service must recheck version, method, consent, age, capacity and learner authority |

A Course can support its own self-paced release and multiple Classes with distinct enrollment. Do not convert Course registration into Class enrollment automatically. One Class can have many scheduled Sessions. A Site is a delivery/host context, not an enrollment itself.

For digital/provider-wide enrollments not attached to physical premises, preserve the provider's legitimate Site/registration authority. Do not invent a physical Site to satisfy reporting.

## Current source implementation

- `src/domain/site-enrollment-opportunities.ts`: typed, pure public opportunity projection. Sources are separately governed.
- `src/domain/site-website-experience.ts`: adaptive School, Community, Training, and Mixed content profiles derived only from approved public opportunities. Launch Studio private planning interests do not confer public authority.
- `src/domain/site-content-channels.ts`: reusable Site-owned channels, typed page placement, multiple blocks from one feed, source sorting, item limits, audience-enrollment target filters.
- `src/components/launch-studio/SiteContentChannelEditor.tsx`: Site editor supports add, duplicate, reorder, page destination, filters, and separate private save / public publication. The Site-first preview also lets operators select an interior page without leaving Launch Studio. Site publication still requires existing Site publisher authorization.
- `src/domain/public-site-html.ts`: native homepage and interior Programs, Courses and Classes pages; navigation, hero and copy follow the Site's verified content.
- `src/domain/public-site-paths.ts`: fixed, safe 13-page Site route allowlist. No arbitrary paths, file serving or private CAN OS endpoint proxy.
- `src/domain/public-site-templates.ts`: seven native layout systems; each receives a public-content-derived profile to avoid forcing a training Site to masquerade as a school.
- `src/modules/sites/site-public-catalog.server.ts` and private preview adapters: use approved academic, published enrichment, approved noncredit and public Class readers. No unreviewed Site content reaches a public page.

An operator may reuse one authoritative source on the homepage and on the relevant interior page. An unrelated custom block must not suppress an approved Course, Program or Class directory. The renderer consumes the Site's block configuration and approved feed projection; individual pages do not store duplicate Course, Class, session, pricing or enrollment records.

## Safe public links

School: application availability remains owned by the academic admissions service, with a vetted `/admissions` destination.

Program: an approved, open enrichment Season with a verified UUID and trusted CAN application HTTPS origin links to `/enrichment/<seasonId>`, the existing Program details and guardian registration workflow. That service still checks permission, household, child, capacity, package and fee rules. Non-enrichment Program types have no speculative registration URL; their safe destination remains `/student-life`.

Course: only an approved noncredit release UUID and a validated HTTPS CAN application origin can produce `/learn/enroll?release=<UUID>`. The POST checks are still authoritative.

Class: a published Class card links to `/learn/classes?classId=<UUID>`, which filters the native public Class catalog by **exact Class ID**. This is not an exact Class Offering-version deep link and is never a promise of immediate self-enrollment. Native Class enrollment keeps its own adult verification, consent, window, allowed method, approved Site, learner and capacity checks.

Private previews and fictional template galleries suppress external enrollment actions and submit no learner records. In Site-first Launch Studio, operators can select Home, Programs, Courses, Classes, Academics or Community Experiences. The authenticated Site preview renders a clearly marked empty page layout before approved content exists, while anonymous public routing continues to return 404 until an eligible source is published. Changing presentation does not change any enrollment terms.

## Release gaps that must not be misrepresented

1. Direct Site Program registration is supported for the existing published enrichment Season workflow only. Other Program types need verified, domain-specific enrollment destinations; no generic enrollment link has been invented.
2. Class discovery now filters by the stable Class ID and revalidates public Class Offering publication. A future exact Class Offering-version URL could improve direct-registration UX, but must continue validating the current version, learner eligibility, capacity and consent.
3. Site-independent provider-wide online Course discovery needs its own legitimate public provider profile if it is to appear outside a single Site.
4. Payment and guardian/youth consent must remain owned by appropriate registered Program, Course or Class workflows. Do not infer them from public listing.
5. The unified public directory is bounded and server rendered; large national catalogs need paginated provider-aware discovery.

## Verification gate

Run, in order, against an exact source revision:

```sh
npm run typecheck
npm run test:site:channels
npm run build:cloudflare
```

Then perform browser acceptance across seven templates × thirteen pages, using separate anonymous, Site Admin, provider, guardian, learner and registrar accounts on a disposable release-matched database.

Verify public release closure, full capacity, private/unlisted Classes, disabled self-enrollment, application suspension, pending affiliation, and denial on revoked Site identity relationships. Match the deployed fingerprint to the passing commit. Until those checks pass, the source is not verified production-ready.

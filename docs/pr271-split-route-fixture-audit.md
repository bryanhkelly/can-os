# PR #271: split-route fixture and CI audit

**Scope:** Fourteen routes reported by `scripts/check-route-fixture-coverage.mjs` as missing manifest entries. This is a source-level review, not authenticated browser acceptance or a production release assessment.

## What was inspected

All fourteen route files exist, declare a TanStack route and component, and delegate to an existing canonical workflow. Existing server APIs enforce role/capability/resource scope; a query string or browser-selected role alone never grants authority. The separate wrappers are not duplicate domain engines.

| Route | Owning workspace or action | Server-side boundary | Fixture and scenario |
| --- | --- | --- | --- |
| `/admin/invite` | Admin `ScopedAdminConsole` invite mode, `inviteStaffMember` | Registrar + `admin.manage`, exact authorized Site | `new-experiences-v1.sql`; choose an eligible Site, create inactive staff invitation |
| `/admin/people` | Admin `ScopedAdminConsole` people mode, `listPeople` | Registrar + `admin.manage`, organization/site-scoped grant reads | `new-experiences-v1.sql`; search authorized people |
| `/admissions/intake/new` | Admissions inquiry, `createAdmissionsInquiry` | Registrar + `enrollment.decide` and scoped Program/household checks | `new-experiences-v1.sql`, `gf2-admissions-test.sql`; validated inquiry and optional public-interest conversion |
| `/operations/curriculum-marketplace/imports` | Marketplace imports / Common Cartridge workflow | Registrar plus publisher permissions for writes and selected Program | `valor-curriculum-marketplace.sql`; validate package and map authorized Section links |
| `/operations/curriculum-marketplace/resources` | Marketplace resources, supplements and private PDFs | Verified Program and scoped curriculum publishing/upload commands | `valor-curriculum-marketplace.sql`; add authorized resource and review private upload |
| `/operations/curriculum-marketplace/roster` | Marketplace OneRoster exchange | Separate institutional registrar roster export and scoped import/mapping checks | `valor-curriculum-marketplace.sql`; preview and map, no identity inference |
| `/operations/curriculum/$courseId` | Curriculum Studio course authoring | Registrar + `curriculum.publish` and owning Program; unavailable ID shown safely | `new-experiences-v1.sql`, `curriculum-authoring.sql`; read and revise a scoped draft |
| `/operations/curriculum/new` | Curriculum Studio course creation | Same publishing grant; creation is not automatic publication | Same curriculum authoring fixture; new course form and create command |
| `/operations/curriculum/publishing` | Curriculum Studio release/pack publishing | Same publishing grant; course release eligibility is rechecked server-side | Same authoring fixture; validate and publish reviewed release |
| `/operations/family-alerts/compose` | Family notices `Publisher` compose mode | Registrar + `communication.send`, active Program, org/Site/Program scope | `new-experiences-v1.sql`, `gf2-admissions-test.sql`; publish scoped notice |
| `/operations/field-trips/$tripId` | Field Trip detail, permission and roster commands | Registrar + `enrollment:manage`, Site/Program scope, independent consent gate | New synthetic proposed trip + existing eligible enrollment; approval and invitation only through canonical commands |
| `/operations/field-trips/new` | Field Trip proposal | Same registrar scope; versioned permission and future-dated schedule required | New synthetic trip + existing Site/Program; propose another reviewed trip |
| `/operations/interest-events/$eventId` | Interest Event detail/RSVP link/attendance | School event-manager capability plus organization/Site/Program scope | New synthetic event + canonical calendar projection; detail and private link rotation |
| `/operations/interest-events/new` | Interest Event creation | `program.read` + `calendar.event.create`, scoped Program and timezone | Same event fixture; create an invitation-only event and its calendar projection |

## Fixture integrity and limitations

- Added `scripts/seeds/split-route-detail-fixtures.sql` for a versioned-permission field-trip proposal and an invitation-only interest event with matching `scheduled_occurrences` and `calendar_events`. It uses stable synthetic IDs, `ON CONFLICT (id) DO NOTHING`, and a hard check of the fixed synthetic organization, Site, Program and registrar. **It has not been applied to a live database.**
- A proposed trip has **no fabricated guardian consent** or pre-created participant. Invitations and consent records must come from the existing commands. A seeded interest event has **no fabricated RSVPs** or attendance. Parent field-trip fixture counts were corrected accordingly.
- The existing `/operations/interest-events` fixture waiver is replaced by a real seeded event contract. `/operations/family-alerts` now includes a seed explicitly providing a guardian relationship.
- These manifest entries document required synthetic records and expected interactions. The route-fixture gate checks declared paths and seed-file existence, **not actual record counts, browser functionality, database seed execution or security acceptance**.
- Detail pages currently read authorized lists and select the requested ID from those results; they provide an explicit unavailable state for missing/out-of-scope records. Authenticated tests, full-list pagination behavior and external provider delivery remain outside this static pass.

## CI change

Both `.github/workflows/ci.yml` and `.github/workflows/fullflow-acceptance-pr.yml` keep route-fixture coverage as a **hard failure** but record its original result using an explicitly named `route_fixtures` step and `continue-on-error: true`. The final enforcement step fails the job after quality checks when coverage is missing. A route-manifest omission no longer skips typecheck, lint or unit tests. A build failure or an unrelated prior gate may still prevent later steps; these changes do not claim the full pipeline is failure-independent.

## Verification needed before acceptance

1. Run `npm run build`, `node scripts/check-route-fixture-coverage.mjs`, `npm run typecheck`, `npm run lint`, and `npm test` on the **final PR commit**. Record actual results, not just workflow configuration.
2. Apply the detail fixture only in a disposable, migrated synthetic database; verify counts, repeatability and read isolation, then exercise representative create/detail/actions with authorized and denied roles.
3. Use an authenticated browser to open all fourteen routes, including a wrong-Site and nonexistent-ID case. Do not interpret source-level authorization checks or manifest completion as browser acceptance.

**Production state:** No production SQL, migrations, user data, role grants or deployment have been modified by this audit.

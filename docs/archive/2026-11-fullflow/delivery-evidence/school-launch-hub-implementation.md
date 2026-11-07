# Grouped school Launch Hub

The school entry in Launch Studio opens `/launch/hub/school`. Administrators
explicitly choose a school returned by the existing authorized launch-options
reader. A missing or unavailable Site never silently falls back to another one.

The Hub uses three sections: Establish Your School (Website), Build Your School
Community (Team, Promote, Recruitment, Events), and Prepare to Open (Academics,
Compliance). Each module has a scoped landing page and return-to-Hub navigation.
Existing website, team, academics and readiness commands remain in their canonical
workspaces; the school setup workspace now includes a return-to-Hub link.

Promote is independent of Website. Its landing page lists media kit, social,
flyer and QR resources and explicitly states that asset creation/downloads are
not yet available. Recruitment and Events are Site-level landing pages only;
they do not invoke Program-scoped sending or registration commands. No demo
metrics or navigation-based completion are used.

School lifecycle routing remains outside this change. Route acceptance fields remain pending. Authenticated browser and
live database acceptance have not been performed.

## Direct Site Admin website authority

An unaffiliated Site Admin uses its existing exact-Site active account grant,
local membership and person relationship to edit and publish Site-owned content.
An extra editor role or membership switch is not needed. The authority reader
rechecks the grant's account, person, role, organization, Site and active state,
as well as current approved network affiliation. Organizations with denomination or CAN network ownership in their ancestry retain
the existing delegated approval workflow. An ordinary local parent organization
does not imply denomination governance. The existing editor assignment path is preserved.

The explicit Prepare school website POST reuses the canonical private-address
reservation service after a stub exists. GETs never create records. Draft saving
remains private. An explicit Site Admin local Publish action runs the existing
Site publication transition inside the same transaction as the immutable local
content revision, audit and events. A Site-owned website can be published before
an academic offering exists. This does not publish academic listings, approve
protected institutional claims, enable admissions, or authorize school opening.
Conflict, source, image rights/consent and claim-review rules remain in force.

## Canonical module connections and status

Website opens Website Studio with an exact-Site return to its Hub module. Team
embeds the ordinary administration workspace with access, invite and directory
views; successful changes refresh the Hub read. Academics embeds the existing
Program configuration or academic provisioning workspace in a focused wrapper.
Private Program drafts retain their exact Site context. Multiple Programs require
an explicit selection. Compliance embeds the existing Journey, service review and
opening-evidence workspaces. These are presentation wrappers over the same readers
and commands; the school wizard is not used as module navigation.

The Hub reader authorizes the selected Site before supplementary reads. It reads
canonical website publication/content revisions, active memberships, recorded
pending staff invitations, Programs and Journey requirements. Each failed read
becomes Unavailable rather than zero or Not Started. Status includes its evidence
summary and next action. Academic completion means recorded academic preparation
requirements, not independent authority. Compliance never becomes Complete solely
because a Journey is prepared. Opening approval remains a separate server decision.

## November 2026 Launch and Website Studio stabilization

- Build Website opens canonical Website Studio directly from the Hub or Settings. Old Website module bookmarks preserve scoped navigation.
- A Site without an address presents a single preparation step, not six inactive design steps. Existing Site re-entry starts at template choice; orientation remains optional.
- All seven Hub capabilities have a destination. Promotion, Recruitment and Events open distinct, Site-scoped, nonoperational landing pages with their intended features and clear limitations. The Website card directs blocked or unavailable memberships to an access/status page.
- Invalid Site selection preserves the submitted identifier and presents the authorized school picker with an explicit error. Invalid Program selection requires an explicit valid Program choice. URL parameters are not silently discarded.
- CAN OS publication alone does not verify public reachability. Hub readiness does not claim external verification.
- Module readers load only the read models relevant to that module, retaining server-verified Site scope. Planned modules do not require database reads beyond exact-Site authorization. Operational read failures are explicitly represented as Unavailable rather than silently treated as empty records.

## Basic school profile creation

`/launch/hub/school/new` uses the existing `createLaunchSite` command with
`stubOnly: true`. It saves a canonical Site, planning city/state metadata,
identity revision, audit and SiteCreated event. It does not create a Program,
Journey, year, Section, website reservation or publication. The legacy location
command defaults to its existing private website reservation behavior.

Only an existing organization-wide registrar-authority grant may create another
Site. Existing Site-bound administrators open their existing school; this change
never expands their grant or appoints an administrator. New public `.demo` schools
already create their canonical Site and Site Admin through the bootstrap service;
their sign-in handoff now enters that exact school's Hub.

The new form navigates directly to the saved Site Hub, with a saved-record link
if navigation fails. Same-details retries return the canonical Site without
additional writes; changes require editing the existing record. Planning location
is distinct from a physical facility address and opening evidence.

## Verification of the module-connection follow-up

Focused authority, transaction, publication, status, failure-isolation, navigation
and render tests are executed locally. The broad non-database run initially found
23 failures: 22 reproduce on the prior commit, and one new Settings navigation
ownership failure was corrected and retested. The prior Hub route fixture manifest
omission was also corrected with declared canonical seed requirements. Declared
fixtures are not evidence that a database scenario has been executed. The remaining
baseline failures are outside this focused change. Build/typecheck/route checks
are integration evidence only; live database and authenticated browser acceptance
remain unverified. No production migrations, grants or data were changed.

Final local checks: build, typecheck (8 GB heap), route ownership and route fixture
coverage passed, with no unseeded routes. The final focused run passed 141 tests
in 19 files. The latest broad run passed 3,935 tests and failed 21; every remaining
failure also reproduces before this follow-up. The new-profile fixture contract
uses the existing Site-bound actor to verify denied sibling creation; positive
organization-wide creation is command-unit-tested, not database/browser accepted.

## Shared configuration in dashboard Settings

Dashboard Settings presents School Profile, Website, Team & Permissions,
Promotion, Recruitment, Events, Academics and Compliance. The Settings module
route uses the same exact-Site loader, Program selection, status projections and
embedded workflows as Launch. A multi-Site membership selects a school explicitly;
return links preserve the chosen Site. Active Programs keep their saved configuration.

School Profile uses the existing revision-checked identity, address and private
contact editors and commands. Website opens the canonical dashboard editor.
Team, Academics and Compliance stay inside the Settings navigation context,
including Program creation and cross-module links. Promotion, Recruitment and
Events retain the same clearly labeled placeholder scope as Launch. This connection introduces no new
configuration tables or write commands and does not change publication permissions
or opening decisions.

Settings follow-up: 84 focused tests passed, covering shared reads, scope,
canonical profile saves, recovery navigation and route metadata. Authenticated
browser and database verification are still pending.

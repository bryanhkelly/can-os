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
metrics, navigation-based completion, activation decisions or new mutations were
introduced. The Website card can show canonical draft/publication state.

This focused change does not implement Site Admin
website publishing authority, canonical school lifecycle routing, module status
aggregation, or dashboard Settings reorganization. Existing authorization and
Program activation remain unchanged. All route acceptance fields remain pending.

Validation: production build, typecheck (8 GB Node heap), route inventory and 52 targeted unit/render/navigation tests.
Browser and authenticated end-to-end verification have not been performed.

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

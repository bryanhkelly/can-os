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

This focused change does not implement minimal school-stub creation, Site Admin
website publishing authority, canonical school lifecycle routing, module status
aggregation, or dashboard Settings reorganization. Existing authorization and
Program activation remain unchanged. All route acceptance fields remain pending.

Validation: production build, typecheck (8 GB Node heap), route inventory and 52 targeted unit/render/navigation tests.
Browser and authenticated end-to-end verification have not been performed.

# App Admin authority for the global Program Catalog and Blueprint Studio

Status: source implementation on `feature/platform-admin-catalog-blueprints-20261120`. No live App Admin browser acceptance or production publish is claimed.

## Roles and ownership

- A verified, non-demo CAN `app_admin` account with null Organization/Site grants can create versioned global Program definitions and CAN-owned reusable Blueprint recipes on the existing `/platform` workspace.
- Global platform capabilities are `catalog.platform.manage` and `blueprint.template.manage`, in addition to `platform.admin`. They do not imply `blueprint.configure`, `blueprint.review`, Site operator, learner, school, network delegation, credential issuance, or Course publication rights.
- Site Admins and Registrars continue their private `Launch Studio / Prepare / Program Catalog` journey. They select already published templates, save Site-scoped configurations, and require independently authorized institutional review for launch. Do not give them global recipe editing rights.
- The global editor does **not** use the Organization-specific `can_v30_program_catalog_*` or `can_v30_blueprint_*` SQL roles. These existing delegated roles continue to secure native institutional configuration/review paths until those paths are separately simplified. The database connection remains server-only and every platform command revalidates the real CAN App Admin grant before operating.
- Blueprint publisher Organization identity is a configured server-side `CAN_PLATFORM_CATALOG_PUBLISHER_ORGANIZATION_ID`. The referenced Organization must exist, have type `can_network` and lifecycle `active`. This is a content ownership identity, **not** another human appointment or a browser-selected ID. Published partner-owned Blueprints are not silently appropriated.

## Draft and publication behavior

1. App Admin creates a new immutable `draft` version. Existing definitions require the latest version number, and concurrent edits fail by the database uniqueness/version checks.
2. A **different verified App Admin** may optionally review and record a planning-only approval in the shared `public.audit_events` journal. The author cannot impersonate an independent reviewer.
3. App Admin may publish the latest audited draft without a second human authorization. Published versions are immutable in the application workflow. Course/Offering, institutional, and enrollment approval requirements remain independent.
4. Only published Program references and Blueprint recipe versions appear in Site planning discovery. A planning publication never publishes an Offering, Course, assessment or media asset; it never authorizes Site operation, enrollment, credit, funding or institutional compliance.

The shared `public.audit_events` journal stores author, optional reviewer and publisher identities. No competing audit store, separate per-Organization role for central authoring, new enrollment path, or synthetic partner approval is created.

## COGIC migration caveat

The existing Phase 1 and Phase 2 draft Solution recipes were seeded under `CAN Community Learning Center (Demo)`, a **prospective** `other_partner` Organization. That is neither CAN's verified production `can_network` publishing identity nor approved COGIC authority. App Admin can see those records in the central inventory, but cannot rewrite them or assume their publisher authority.

Before using the central editor to create new versions of those exact recipe codes, approve a real CAN publishing Organization and perform a separately reviewed provenance/ownership migration or recreate the recipes with new codes. Do not mutate historical published version IDs or reassign existing rows without impact review.

## Acceptance gates

- Confirm at least one independently provisioned non-demo `app_admin` account. A second verified App Admin is only necessary if an optional peer review is used.
- Configure the approved CAN publisher Organization, and verify that the runtime database service account may perform these server-scoped operations without enabling anonymous database writes. If a dedicated restricted service principal is introduced, it must be applied as a single infrastructure role, not per Site or per Organization.
- Run typecheck, build, authorization regression, and `platform-catalog-admin.test.ts` against the exact branch SHA.
- In an authenticated browser: create a Program draft, create a Blueprint draft, deny self-attributed peer review, optionally approve with a different App Admin, publish as App Admin, verify Site discovery, and verify Site Admin cannot access platform authoring.
- Preserve existing institution-specific reviewer independence, Course publication and enrollment gates. This change does not make the COGIC pilot live.

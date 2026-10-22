# FullFlow — one integrated school-network-to-classroom progression

**Working branch:** `FullFlow`. No changes to `main` without explicit approval.
This checklist records evidence and blockers, not automatic production acceptance.

## Product boundary: agreements, affiliation, school operations

1. **CAN** contracts with an independent denomination/network organization. An executed commercial agreement is **not** the same as a verified user grant.
2. **Denomination HQ administrator** holds an explicit `network_admin` membership under their denomination organization. HQ may create **directly operated** Site records for that organization. This membership does **not** grant academic, guardian, medical, admissions, curriculum-publishing or student-operation authority.
3. **Independently governed church/school** remains the owner of its own Organization and Sites. A site may request denomination affiliation without changing `sites.organization_id`.
4. **Affiliation link** is a reviewed relationship between a denomination Organization and a pre-existing Site (with its owner Organization). It must have its own pending/approved/rejected/revoked state, evidence and independent permission checks. A pending request is **not** an approved network membership and approval is **not** a student-data grant.
5. **Local school operator/registrar** still performs the separate school/program launch, academic setup, admissions, enrollment and classroom activities under its own grants.

### Two intentional HQ entry paths

- **HQ-created location:** authorized denomination HQ administrator creates a `Site` with `organization_id` belonging to that denomination. No school program, admissions or student record is automatically created. Implemented in this bite.
- **Site-requested affiliation:** an authorized local school/site administrator identifies the denomination, submits an affiliation request, HQ reviews and accepts/denies. Keep the original site owner and school grants intact. **Not yet implemented.** Do **not** use `organizations.parent_organization_id` to impersonate a reviewed multi-network affiliation or silently grant HQ academic access.

## Bite register

| Bite | Goal | Implementation | Acceptance |
| --- | --- | --- | --- |
| 1A | Correct organization-wide vs site-limited school launch grant handling | In `FullFlow`, inherited from prior school-launch patch | Primary CI passed on prior isolated patch; signed-in acceptance pending |
| 1B | HQ creates its own location with distinct non-academic `network_admin` grant | Server commands, domain policy, HQ workspace and unit tests added on `FullFlow` | CI and isolated database/browser tests pending; HQ grant must be deliberately provisioned |
| 1C | Independent site requests link to denomination; HQ reviews it | **Next** — requires persisted affiliation request, approval/revocation, and negative-access tests | Not started |
| 2 | Independently governed school configures high-school extension | Existing GF3 flows, then closed-loop acceptance | Not accepted |
| 3 | Curriculum adoption, teacher and class provisioning | Existing canonical publisher/school/classroom tools | Not accepted |
| 4 | Family application, offer, activation and class assignment | Existing GF22/GF2 | Not accepted |
| 5 | Lessons, assignments, submissions and grades | Existing classroom/learning | Not accepted |
| 6 | Parent, teacher and operational follow-through | Existing GF1/GF4/actions/notification flows | Not accepted |

## Acceptance for bite 1B

- HQ grant belongs to a verified denomination Organization and has no Site restriction.
- HQ can create and read only Sites **owned by that denomination**, never Site/Student records belonging to independent affiliated entities.
- Repeating an identical create for the same slug is idempotent; conflicting slug details reject.
- Every successful write creates canonical transactional `SiteCreated` and `network.site.create` audit evidence.
- A local registrar or site-restricted HQ membership cannot create an HQ location.
- School creation, enrollment, staff grants and program launch are **not** side effects.
- Typecheck, build and unit tests are required; isolated Neon service test and real signed-in browser test remain separate acceptance gates.

## Open issues

- A legitimate HQ `network_admin` grant needs a separate authorized CAN onboarding/provisioning path; the existing school registrar staff invitation is not allowed to mint one.
- The existing `sites.organization_id` is an ownership edge, not a network-membership edge. A new association model with clear permissions and independent approvals is necessary for site-requested links.
- Do not assert a denomination-wide right to student data or treat a signed contract as automatic access.

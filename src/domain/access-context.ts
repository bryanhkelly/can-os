import { AuthorizationError, type CommandContext } from "./command-context";

/** Claims are resolved from verified DB rows, never from caller-provided roles. */
export type VerifiedAccessGrant = {
 id: string;
 accountId: string;
 personId: string;
 role: string;
 organizationId: string | null;
 siteId: string | null;
 active: boolean;
};
export type SessionPrincipal = {
 accountId: string;
 sessionId: string;
 activeGrantId: string | null;
};
export type AccessContext = CommandContext & {
 accountId: string;
 sessionId: string;
 grantId: string;
 /** Original verified membership site (null means organization-wide), before effective site expansion. */
 grantSiteId: string | null;
 role: string;
};

/** Capability mapping is centralized; domain-specific relationship checks are still required. */
export const roleCapabilities: Readonly<Record<string, readonly string[]>> = Object.freeze({
 // Network partners govern affiliation and their own sites; never student or school operations.
 can_network_steward: ["network.agreements.verify", "network.admins.provision"],
 network_admin: ["network.sites.read", "network.sites.manage", "network.affiliations.read", "network.affiliations.review"],
 // Partner website review is deliberately NOT registration, academic approval,
 // institutional publication, Site operations or access to family records.
 // A same-Site role assignment is additionally required on each server read.
 site_website_editor: ["site.website.draft.read", "site.website.local.publish"],
 // First-observer site personnel: report-only capability, NEVER incident.read,
 // counseling access, enrollment editing or automatic emergency dispatch.
 room_facilitator: ["safeguarding.concern.submit", "onsite.attendance.record","onsite.pickup.release","profiles.credentials.submit"],
 site_staff: ["safeguarding.concern.submit", "onsite.attendance.record","onsite.pickup.release","profiles.credentials.submit"],
 site_leader: ["safeguarding.concern.submit", "onsite.attendance.record","onsite.pickup.release","profiles.credentials.submit"],
 paraeducator: ["safeguarding.concern.submit"],
 student: ["student:read","assignments:submit","study-groups:participate","notifications:manage","communication.send","calendar.event.create"],
 teacher: ["teacher:read","profiles.credentials.submit","notifications:manage","assignments:grade","assignments:create","referrals:create","discussions:moderate","communication.send","attendance.write","attendance.excuse.review","action.create","action.resolve","program.read","calendar.event.create","calendar.event.manage","insights:read","capacity.read","conference.manage","conference.complete","conference.remind"],
 guardian: ["activity.register","guardian:read","notifications:manage","enrollment:manage","enrollment.apply","student:related-read","communication.send","attendance.excuse.submit","guardian.pickup.manage","calendar.event.create","conference.book"],
 registrar: ["network.affiliations.request", "network.affiliations.read", "curriculum.publish","curriculum.adopt","program.opening.handoff.manage","admissions:read","profiles.catalog.create","profiles.credentials.verify","notifications:manage","admissions:decide","enrollment.decide","enrollment.activate","enrollment:manage","registrations:approve","attendance.write","attendance.excuse.review","communication.send","program.read","program.launch.start","site.publication.manage","program.activate","staffing.policy.publish","calendar.event.create","calendar.event.manage","academic_year.manage","academic_year.activate","action.resolve","journey.requirement.complete","admin.manage","insights:read","insights:manage","capacity.read","capacity.manage","capacity.demand.manage","capacity.reserve","safeguarding.policy.manage","health.read","health.manage","health.compliance.manage","medication.authorization.manage","health.clearance.manage"],
 // Named responders receive no Site-wide case browsing power. Every read and
 // mutation additionally requires an active assignment to the restricted case.
 safeguarding_responder: ["notifications:manage","safeguarding.case.read","safeguarding.respond","safeguarding.evidence.add","safeguarding.external_report.record"],
 safeguarding_lead: ["notifications:manage","safeguarding.case.read","safeguarding.respond","safeguarding.evidence.add","safeguarding.external_report.record","safeguarding.policy.manage"],
 specialist: ["referrals:read","notifications:manage","referrals:manage","support-plans:manage","communication.send","action.resolve","action.create","calendar.event.create","insights:read"],
 counselor: ["referrals:read","notifications:manage","referrals:manage","support-plans:manage","communication.send","action.resolve","action.create","calendar.event.create","insights:read"],
});

/** This may be called only after authenticating a server session and fetching grants from Neon. */
export function resolveAccessContext(principal: SessionPrincipal, grants: readonly VerifiedAccessGrant[]): AccessContext {
 const grant = grants.find(g => g.id === principal.activeGrantId && g.accountId === principal.accountId && g.active);
 if (!grant || !Object.hasOwn(roleCapabilities,grant.role)) throw new AuthorizationError("active membership");
 return {
  accountId: principal.accountId,
  sessionId: principal.sessionId,
  grantId: grant.id,
  grantSiteId: grant.siteId,
  actorPersonId: grant.personId,
  role: grant.role,
  capabilities: new Set(roleCapabilities[grant.role]),
  scope: {
   organizationIds: grant.organizationId ? [grant.organizationId] : [],
   siteIds: grant.siteId ? [grant.siteId] : [],
  },
 };
}
export function assertGrantSelection(accountId: string, proposedGrantId: string, grants: readonly VerifiedAccessGrant[]): void {
 if (!grants.some(g => g.accountId === accountId && g.id === proposedGrantId && g.active && Object.hasOwn(roleCapabilities,g.role))) {
  throw new AuthorizationError("active membership");
 }
}

/** Project a verified organization/site grant onto permitted program IDs. */
export function authorizedProgramIds(
  programs: readonly {id:string;siteId:string|null}[],
  organizationIds: readonly string[],
  siteIds: readonly string[],
):string[]{
  if(organizationIds.length===0)return [];
  return programs.filter(program=>siteIds.length===0||(program.siteId!==null&&siteIds.includes(program.siteId))).map(program=>program.id);
}

import { z } from "zod";
import type { AccessContext } from "./access-context";
import { assertCapability, AuthorizationError } from "./command-context";
import { hasRegistrarAuthority, rolesAllow } from "./school-roles";

export const siteRoomsScopeSchema = z.object({ programId: z.string().uuid() }).strict();
export const createSiteRoomSchema = siteRoomsScopeSchema.extend({
  roomId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  capacity: z.number().int().min(1).max(1000),
}).strict();
export const assignSectionRoomSchema = siteRoomsScopeSchema.extend({
  sectionId: z.string().uuid(), roomId: z.string().uuid().nullable(),
}).strict();
export const updateSiteRoomSchema = createSiteRoomSchema.extend({
  expectedRevision: z.number().int().positive(),
  reason: z.string().trim().min(5).max(1000),
}).strict();
export const retireSiteRoomSchema = siteRoomsScopeSchema.extend({
  roomId: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
  reason: z.string().trim().min(5).max(1000),
  confirmed: z.literal(true),
}).strict();

/** Room and section-name lookup only: local church leaders must see the
 * physical campus directory without receiving registrar write authority. */
export function assertSiteRoomReader(actor: AccessContext, school: {
  programId: string; organizationId: string; siteId: string;
}) {
  if (!actor.actorPersonId || !rolesAllow(["registrar","site_leader"],actor.role) ||
      !actor.scope.organizationIds?.includes(school.organizationId) ||
      !actor.scope.programIds?.includes(school.programId) ||
      !actor.scope.siteIds?.includes(school.siteId) ||
      (actor.grantSiteId !== null && actor.grantSiteId !== school.siteId))
    throw new AuthorizationError("authorized school room reader for this exact Site and Program");
}

export function assertSiteRoomManager(actor: AccessContext, school: {
  programId: string; organizationId: string; siteId: string;
}) {
  assertCapability(actor, "program.launch.start");
  if (!actor.actorPersonId || !hasRegistrarAuthority(actor.role) ||
      !actor.scope.organizationIds?.includes(school.organizationId) ||
      !actor.scope.programIds?.includes(school.programId) ||
      !actor.scope.siteIds?.includes(school.siteId) ||
      (actor.grantSiteId !== null && actor.grantSiteId !== school.siteId))
    throw new AuthorizationError("school setup authority for this exact Site and Program");
}

import { and, eq, gt, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db/client";
import { canonicalClasses, canonicalClassStaffAssignments } from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { currentClassAuthority } from "./native-class-authority.server";
import { assertCurrentNativeTeachingGrant } from "./native-class-room-boundary.server";
import { requireCanonicalFacilitator } from "@/modules/learning/canonical-facilitator-access.server";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
type Host=Awaited<ReturnType<typeof requireCanonicalFacilitator>>;

/** Server-only host authorization; never expose this database/grant reader
 * as a client-reachable export from a .functions.ts RPC module. */
export async function requireNativeClassSessionHost(
  tx:Tx,host:Host,classId:string,now:Date,lock=false,
){
  const query=tx.select().from(canonicalClasses)
    .where(eq(canonicalClasses.id,classId)).limit(1);
  const [instance]=lock?await query.for("update"):await query;
  if(!instance || instance.state!=="active" || !instance.siteId ||
     instance.operatingOrganizationId!==host.organizationId ||
     !host.siteIds.includes(instance.siteId) ||
     !["scheduled","hybrid","facilitated"].includes(instance.deliveryMode))
    throw new AuthorizationError("active, authorized hosted Class");
  await currentClassAuthority(tx,instance.id,now);
  const [assignment]=await tx.select({
    id:canonicalClassStaffAssignments.id,
  }).from(canonicalClassStaffAssignments)
    .where(and(
      eq(canonicalClassStaffAssignments.classId,instance.id),
      eq(canonicalClassStaffAssignments.personId,host.actor.actorPersonId!),
      eq(canonicalClassStaffAssignments.state,"approved"),
      lte(canonicalClassStaffAssignments.beginsAt,now),
      or(isNull(canonicalClassStaffAssignments.endsAt),
        gt(canonicalClassStaffAssignments.endsAt,now)),
    )).limit(1);
  if(!assignment)throw new AuthorizationError("explicit active Class teaching assignment");
  await assertCurrentNativeTeachingGrant(tx,host.actor.actorPersonId!,host.organizationId,instance.siteId);
  return instance;
}

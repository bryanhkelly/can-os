import { z } from "zod";

export const ownerPilotRoles = [
  "academic_content_creator", "academic_content_reviewer", "deployment_readiness_reviewer",
  "registrar", "site_admin", "room_facilitator",
] as const;

export type OwnerPilotRole = (typeof ownerPilotRoles)[number];
export function ownerGrantRequiresSite(role: OwnerPilotRole): boolean {
  return role==="registrar"||role==="site_admin"||role==="room_facilitator";
}

const uuid=z.string().uuid();
export const ownerPilotGrantInput=z.object({
  accountId:uuid,organizationId:uuid,siteId:uuid.nullable(),
  role:z.enum(ownerPilotRoles),
  reason:z.string().trim().min(12).max(500),
}).strict();
export type OwnerPilotGrantInput=z.infer<typeof ownerPilotGrantInput>;

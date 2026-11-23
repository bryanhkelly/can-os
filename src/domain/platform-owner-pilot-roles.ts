export const ownerPilotRoles = [
  "academic_content_creator", "academic_content_reviewer",
  "registrar", "site_admin", "room_facilitator",
] as const;

export type OwnerPilotRole = (typeof ownerPilotRoles)[number];
export function ownerGrantRequiresSite(role: OwnerPilotRole): boolean {
  return role==="registrar"||role==="site_admin"||role==="room_facilitator";
}

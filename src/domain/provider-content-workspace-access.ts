import { AuthorizationError } from "./command-context";

/** Page permissions must match the existing course-scoped creator/reviewer service. */
export const providerContentRoles = ["academic_content_creator", "academic_content_reviewer"] as const;
export type ProviderContentRole = (typeof providerContentRoles)[number];

export function requireProviderContentRole(role: string): ProviderContentRole {
  if (role !== "academic_content_creator" && role !== "academic_content_reviewer") {
    throw new AuthorizationError("verified provider content role");
  }
  return role;
}

export function providerContentCapability(role: ProviderContentRole) {
  return role === "academic_content_creator"
    ? "instructional_track.author" as const
    : "instructional_track.review" as const;
}

export function providerContentHome(role: ProviderContentRole) {
  return role === "academic_content_creator"
    ? "/canonical/content" as const
    : "/canonical/content-reviews" as const;
}

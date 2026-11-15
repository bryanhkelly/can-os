import { AuthorizationError } from "@/domain/command-context";
import { canonicalRestrictedAuthUrlValid } from "@/domain/canonical-auth-connection";

/**
 * Canonical learning and facilitated rooms are normal, role-scoped product
 * capabilities. There is no deployment toggle or rollout environment flag.
 *
 * The required restricted session reader and signing secrets remain mandatory.
 * An incomplete or privileged auth configuration fails closed. Enrollment,
 * Site, Course, content-rights and actor authorization are checked separately
 * by each server command.
 */
function nativeAuthConfigured(): boolean {
  return canonicalRestrictedAuthUrlValid(
    process.env.CAN_CANONICAL_AUTH_DATABASE_URL, process.env.DATABASE_URL,
  ) && (process.env.CAN_CANONICAL_ACCESS_TOKEN_PEPPER?.length ?? 0) >= 32;
}

export function canonicalLearningRuntimeReady(): boolean {
  return nativeAuthConfigured();
}

export function facilitatedLearningRuntimeReady(): boolean {
  return nativeAuthConfigured() &&
    (process.env.CAN_FACILITATED_PAIRING_PEPPER?.length ?? 0) >= 32;
}

/** Maintained entry-point names for existing callers; these assert readiness,
 * not a feature flag. */
export function requireCanonicalLearningActivityEnabled(): void {
  if (!canonicalLearningRuntimeReady()) {
    throw new AuthorizationError("canonical learning restricted authentication is not configured");
  }
}

export function requireFacilitatedLearningEnabled(): void {
  if (!facilitatedLearningRuntimeReady()) {
    throw new AuthorizationError("facilitated learning restricted authentication and pairing are not configured");
  }
}

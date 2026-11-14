import { AuthorizationError } from "@/domain/command-context";

/**
 * Explicit opt-in only. Do not open learner activity or shared-screen delivery
 * until the dedicated native-auth connection and signing secrets are configured.
 * Failing configuration never grants a broader default DB connection.
 */
function nativeAuthConfigured() {
  return Boolean(process.env.CAN_CANONICAL_AUTH_DATABASE_URL) &&
    (process.env.CAN_CANONICAL_ACCESS_TOKEN_PEPPER?.length ?? 0) >= 32;
}
export function requireCanonicalLearningActivityEnabled() {
  if (process.env.CAN_CANONICAL_ACTIVITY_ENABLED !== "true")
    throw new AuthorizationError("canonical learning activity is not enabled");
  if (!nativeAuthConfigured())
    throw new AuthorizationError("canonical learning native authentication is not configured");
}
export function requireFacilitatedLearningEnabled() {
  if (process.env.CAN_FACILITATED_LEARNING_ENABLED !== "true")
    throw new AuthorizationError("facilitated learning is not enabled");
  if (!nativeAuthConfigured() ||
      (process.env.CAN_FACILITATED_PAIRING_PEPPER?.length ?? 0) < 32)
    throw new AuthorizationError("facilitated learning authentication and pairing is not configured");
}

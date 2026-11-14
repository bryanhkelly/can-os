import { AuthorizationError } from "@/domain/command-context";

/** All new server endpoints are off until DB role and browser acceptance. */
export function requireCanonicalLearningActivityEnabled() {
  if (process.env.CAN_CANONICAL_ACTIVITY_ENABLED !== "true")
    throw new AuthorizationError("canonical learning activity is not enabled");
}
export function requireFacilitatedLearningEnabled() {
  if (process.env.CAN_FACILITATED_LEARNING_ENABLED !== "true")
    throw new AuthorizationError("facilitated learning is not enabled");
}

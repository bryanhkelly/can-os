import { normalizeClientError } from "@/lib/client-error";
import { enrollInNativeClass } from "./native-class-enrollment.functions";
import { resumeLinkedNativeClassLearner } from "./native-class-session-recovery.functions";
import { activateReviewedNativeClassLearner } from "./native-class-reviewed-onboarding.functions";

/**
 * Reusable enrollment orchestration for a single interactive CAN sign-in.
 * Called only from a user-initiated UI action; safe to import into an SSR route
 * because the module itself performs no browser-only work at import time.
 *
 * Each createServerFn call is its own HTTP round trip. That is necessary:
 * the newly issued HttpOnly native cookie is only visible to the next
 * browser request, not to later commands inside the same server request.
 *
 * No permission decision is made here; all authorities, identity creation,
 * reviewed adulthood, eligibility and seat writes stay server-side.
 */
export async function enrollCurrentPersonInClass(
  input: Parameters<typeof enrollInNativeClass>[0],
) {
  try {
    return await enrollInNativeClass(input);
  } catch(originalError) {
    if(normalizeClientError(originalError).code!=="CANONICAL_LEARNER_SESSION_REQUIRED")
      throw originalError;
  }
  try {
    await resumeLinkedNativeClassLearner();
  } catch(recoveryError) {
    if(normalizeClientError(recoveryError).code!=="CANONICAL_LEARNER_ONBOARDING_REQUIRED")
      throw recoveryError;
    await activateReviewedNativeClassLearner();
  }
  // The new cookie is now present on this separate request.
  return enrollInNativeClass(input);
}

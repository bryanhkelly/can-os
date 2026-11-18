import { AuthorizationError } from "./command-context";
import { canonicalSessionCookie } from "./canonical-access";
import { accessSessionCookie } from "./access-tokens";
import { readCookie } from "./session-cookies";

/**
 * The sole interactive learner identity is the CAN access session.
 *
 * Until the canonical learning-session/Person FK migration is complete, a
 * native bearer may accompany the CAN cookie only as an explicitly reconciled
 * historical participation credential. It must never authenticate a learner
 * on its own. This checks cookie provenance, NOT current membership or grant;
 * callers must still revalidate the real CAN session through the DB reader.
 */
export function canLearningCookieMode(
  request: Request,
): "can" | "can_with_native" {
  // These readers refuse duplicate names rather than silently choosing one.
  const can = readCookie(request, accessSessionCookie);
  const native = readCookie(request, canonicalSessionCookie);
  if (!can || !/^[A-Za-z0-9_-]{40,}$/.test(can)) {
    throw new AuthorizationError("authenticated session");
  }
  return native === undefined ? "can" : "can_with_native";
}

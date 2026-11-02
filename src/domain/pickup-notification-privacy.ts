/**
 * Default-safe automatic notices for custody-sensitive school-day events.
 * Reporting a restriction, resolving one, or denying an unknown adult is not
 * permission to disclose it to everyone with a guardian account.
 * The restricted school Action, human escalation and external reporting
 * remain independent of this policy.
 */
export type PickupFamilyNoticeEvent =
  | "hold_created" | "hold_resolved" | "pickup_denied"
  | "verified_release" | "uncollected_child";

export function maySendAutomatedPickupFamilyNotice(input: {
  event: PickupFamilyNoticeEvent;
  activeCustodyHold?: boolean;
}): boolean {
  if (input.event === "verified_release") return true;
  if (input.event === "uncollected_child")
    return input.activeCustodyHold !== true;
  return false;
}

/**
 * These are evidence-gathering assignments, NOT clearance or proof of safety.
 * A resolved Action is never sufficient to publish a season.
 */
export const extendedLearningReadinessTasks = [
  { key: "site_operator", title: "Confirm named receiving site operator" },
  { key: "safeguarding", title: "Obtain approved safeguarding coverage and reporting plan" },
  { key: "onsite_staffing", title: "Verify screened and qualified onsite supervision" },
  { key: "emergency_response", title: "Obtain reviewed site emergency response procedures" },
  { key: "child_release", title: "Obtain child pickup and authorized-release procedures" },
  { key: "session_coverage", title: "Verify dated sessions and assigned staff coverage" },
] as const;

export type ExtendedReadinessTaskKey = (typeof extendedLearningReadinessTasks)[number]["key"];
export const extendedLearningReadinessActionType = "extended_learning_readiness";

/** Never trust arbitrary task keys or action status as approval evidence. */
export function missingExtendedReadinessTasks(
  recordedKeys: readonly unknown[],
): ExtendedReadinessTaskKey[] {
  const seen = new Set(recordedKeys.filter((key): key is string => typeof key === "string"));
  return extendedLearningReadinessTasks.filter(t => !seen.has(t.key)).map(t => t.key);
}

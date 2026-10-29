/** Shared release/close policy. A due date marks lateness, never closure.
 * Student-specific authorized extensions must be resolved by the owning service
 * before passing the effective closesAt; a Section recommendation grants none.
 */
export function assessmentAvailability(input: {
  status: string;
  availableAt: Date | null;
  closesAt: Date | null;
}, now = new Date()) {
  if (input.status !== "published") return { actionable: false, reason: "unpublished_or_closed" } as const;
  if (input.availableAt && input.availableAt > now) return { actionable: false, reason: "unreleased" } as const;
  if (input.closesAt && input.closesAt <= now) return { actionable: false, reason: "closed" } as const;
  return { actionable: true, reason: null } as const;
}

export function assertAssessmentActionable(input: Parameters<typeof assessmentAvailability>[0], now = new Date()) {
  const result = assessmentAvailability(input, now);
  if (!result.actionable) throw new Error(result.reason === "unreleased"
    ? "This assignment has not been released yet"
    : "This assignment is closed for student work");
}

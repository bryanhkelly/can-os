/** Due dates indicate lateness; closure is a separate submission boundary. */
export function assertAssessmentSchedule(input: {
  availableAt: Date | null; dueAt: Date | null; closesAt: Date | null;
}) {
  const { availableAt, dueAt, closesAt } = input;
  if ([availableAt, dueAt, closesAt].some(date => date && !Number.isFinite(date.getTime())))
    throw new Error("Enter valid assignment dates");
  if (availableAt && dueAt && availableAt > dueAt)
    throw new Error("Release must be on or before the due date");
  if (availableAt && closesAt && closesAt <= availableAt)
    throw new Error("Close must be after release");
  if (dueAt && closesAt && closesAt < dueAt)
    throw new Error("Close must be on or after the due date");
}

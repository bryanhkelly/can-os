/**
 * Physically witnessed child handoff events are contemporaneous school-local
 * observations. An old attendance correction must not become new pickup
 * evidence. Existing events remain readable and identical mutation-ID retries
 * are handled before this check in the persistence commands.
 */
export function assertCurrentPickupObservationDate(
  recordedDate: string,
  currentSchoolDate: string,
): void {
  if (recordedDate !== currentSchoolDate)
    throw new Error(
      "Pickup observations must be recorded on the current school-local day. " +
      "Use attendance correction or incident reporting for historical facts.",
    );
}

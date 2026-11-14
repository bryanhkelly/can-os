/**
 * A teacher may reopen their own follow-up but must never receive a colleague's
 * private Action ID when the missing-work item is already being handled.
 */
export function existingMissingWorkFollowUpResponse(
  action: { id: string; ownerPersonId: string | null },
  requestingTeacherPersonId: string,
): { actionId: string | null; created: false; assignedToAnotherTeacher: boolean } {
  const isOwner = action.ownerPersonId === requestingTeacherPersonId;
  return {
    actionId: isOwner ? action.id : null,
    created: false,
    assignedToAnotherTeacher: !isOwner,
  };
}

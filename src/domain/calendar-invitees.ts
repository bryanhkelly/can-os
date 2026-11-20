/** Count unique real people for calendar invitation limits.
 * A person selected directly and through one or more groups counts once.
 */
export function countCalendarInvitees(
  groups: ReadonlyArray<{ id: string; members: ReadonlyArray<{ personId: string }> }>,
  groupIds: readonly string[],
  personIds: readonly string[],
): number {
  const people = new Set(personIds);
  const selectedGroups = new Set(groupIds);
  for (const group of groups) {
    if (!selectedGroups.has(group.id)) continue;
    for (const member of group.members) people.add(member.personId);
  }
  return people.size;
}

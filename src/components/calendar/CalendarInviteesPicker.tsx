import { type Dispatch, type SetStateAction } from "react";
import { Checkbox } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { countCalendarInvitees } from "@/domain/calendar-invitees";
import type { listCalendarInviteOptions } from "@/modules/calendar/calendar.functions";

type InviteOptions = Awaited<ReturnType<typeof listCalendarInviteOptions>>;
type InviteGroup = InviteOptions["groups"][number];
type InviteContact = InviteOptions["contacts"][number];

/** Shared, controlled GAL picker. Visible options are already scoped by the
 * authorized calendar service; the server revalidates invitees on submit.
 */
export function CalendarInviteesPicker({
  inviteGroups, inviteContacts, inviteGroupsError, inviteContactsError, loading,
  inviteSearch, setInviteSearch, inviteGroupIds, setInviteGroupIds,
  inviteePersonIds, setInviteePersonIds,
}: {
  inviteGroups: InviteGroup[];
  inviteContacts: InviteContact[];
  inviteGroupsError: string;
  inviteContactsError: string;
  loading: boolean;
  inviteSearch: string;
  setInviteSearch: Dispatch<SetStateAction<string>>;
  inviteGroupIds: string[];
  setInviteGroupIds: Dispatch<SetStateAction<string[]>>;
  inviteePersonIds: string[];
  setInviteePersonIds: Dispatch<SetStateAction<string[]>>;
}) {
  const groupPeople = new Map<string, { personId: string; name: string; label: string }>();
  for (const group of inviteGroups) {
    for (const member of group.members) {
      const current = groupPeople.get(member.personId);
      groupPeople.set(member.personId, {
        personId: member.personId,
        name: member.name,
        label: current ? `${current.label}; ${group.title}` : `${group.kind.replaceAll("_", " ")} member · ${group.title}`,
      });
    }
  }
  const inviteDirectory = new Map(inviteContacts.map(contact => [contact.personId, contact]));
  for (const [personId, person] of groupPeople) {
    if (!inviteDirectory.has(personId)) inviteDirectory.set(personId, person);
  }
  const normalizedInviteSearch = inviteSearch.trim().toLowerCase();
  const visibleInvitePeople = [...inviteDirectory.values()].filter(contact =>
    !normalizedInviteSearch || `${contact.name} ${contact.label}`.toLowerCase().includes(normalizedInviteSearch));
  const visibleInviteGroups = inviteGroups.filter(group =>
    !normalizedInviteSearch || group.title.toLowerCase().includes(normalizedInviteSearch) ||
    group.members.some(member => member.name.toLowerCase().includes(normalizedInviteSearch)));
  const groupInviteeIds = new Set(inviteGroups.filter(group => inviteGroupIds.includes(group.id))
    .flatMap(group => group.members.map(member => member.personId)));
  const selectedInviteeCount = countCalendarInvitees(inviteGroups, inviteGroupIds, inviteePersonIds);
  const selectedInviteeNames = [...inviteDirectory.values()].filter(contact =>
    inviteePersonIds.includes(contact.personId) && !groupInviteeIds.has(contact.personId));

  return <section aria-label="Event invitees" className="min-w-0 border-t border-border pt-4 md:border-l md:border-t-0 md:pl-6 md:pt-0">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-semibold">Invite people or groups</h3>
                  <span className="text-sm text-muted-foreground">{selectedInviteeCount} selected</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Only people in your role-scoped Global Address List (GAL) and permitted groups appear here. The server verifies selections again when you create the event.</p>
                <Field label="Search the Global Address List" className="mt-4">
                  <Input type="search" value={inviteSearch} onChange={event => setInviteSearch(event.target.value)}
                    placeholder="Search people or groups" />
                </Field>
                {(inviteContactsError || inviteGroupsError) && <div className="mt-3 space-y-1">
                  {inviteContactsError && <p role="alert" className="text-xs text-danger">{inviteContactsError}</p>}
                  {inviteGroupsError && <p role="alert" className="text-xs text-danger">{inviteGroupsError}</p>}
                </div>}
                {loading && <p role="status" className="mt-3 text-sm text-muted-foreground">Loading authorized contacts…</p>}
                {!loading && <div className="mt-3 max-h-64 space-y-4 overflow-y-auto border-y border-border py-3">
                  {visibleInviteGroups.length > 0 && <fieldset className="space-y-2">
                    <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Groups</legend>
                    {visibleInviteGroups.map(group => <Label key={group.id} className="flex cursor-pointer items-start gap-3 py-1 text-sm">
                      <Checkbox className="mt-0.5 size-4 accent-primary" checked={inviteGroupIds.includes(group.id)}
                        onChange={event => setInviteGroupIds(ids => event.target.checked
                          ? [...ids, group.id] : ids.filter(id => id !== group.id))} />
                      <span className="min-w-0"><span className="block font-medium">{group.title}</span>
                        <span className="block text-xs text-muted-foreground">{group.members.length} eligible {group.members.length === 1 ? "member" : "members"}</span></span>
                    </Label>)}
                  </fieldset>}
                  <fieldset className="space-y-2">
                    <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">People</legend>
                    {visibleInvitePeople.map(contact => <Label key={contact.personId} className="flex cursor-pointer items-start gap-3 py-1 text-sm">
                      <Checkbox className="mt-0.5 size-4 accent-primary" checked={inviteePersonIds.includes(contact.personId)}
                        onChange={event => setInviteePersonIds(ids => event.target.checked
                          ? [...ids, contact.personId] : ids.filter(id => id !== contact.personId))} />
                      <span className="min-w-0"><span className="block font-medium">{contact.name}</span>
                        <span className="block text-xs text-muted-foreground">{contact.label}</span></span>
                    </Label>)}
                    {!visibleInvitePeople.length && <p className="text-sm text-muted-foreground">No matching people in your authorized address list.</p>}
                  </fieldset>
                  {!visibleInviteGroups.length && !visibleInvitePeople.length && inviteSearch &&
                    <p className="text-sm text-muted-foreground">No matching people or groups.</p>}
                </div>}
                <div className="mt-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected guests</h4>
                  {selectedInviteeCount > 100 && <p role="alert" className="mt-2 text-xs text-danger">Choose no more than 100 people.</p>}
                  {inviteGroupIds.length > 50 && <p role="alert" className="mt-2 text-xs text-danger">Choose no more than 50 groups.</p>}
                  {!selectedInviteeCount ? <p className="mt-2 text-sm text-muted-foreground">No invitees selected.</p> : <ul className="mt-2 space-y-1 text-sm">
                    {inviteGroupIds.map(groupId => {
                      const group = inviteGroups.find(item => item.id === groupId);
                      return group ? <li key={group.id} className="flex justify-between gap-2"><span>{group.title}</span><span className="text-xs text-muted-foreground">Group</span></li> : null;
                    })}
                    {selectedInviteeNames.map(contact => <li key={contact.personId} className="flex justify-between gap-2"><span>{contact.name}</span><span className="text-xs text-muted-foreground">Person</span></li>)}
                  </ul>}
                </div>
              </section>;
}

import { useState } from "react";
import { Check, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { listThreadContacts } from "@/modules/communication/messages.functions";

type Contact = Awaited<ReturnType<typeof listThreadContacts>>["contacts"][number];

export function ContactLookup({ contacts, value, onChange, disabled }: {
  contacts: Contact[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const selected = contacts.find(contact => contact.personId === value);
  const matches = contacts.filter(contact =>
    contact.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <section aria-label="Contact lookup" className="grid gap-2">
    <label htmlFor="message-contact-search" className="text-sm font-semibold">Find a contact</label>
    <div className="relative">
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
      <Input id="message-contact-search" type="search" value={query} disabled={disabled}
        onChange={event => setQuery(event.target.value)} placeholder="Search by name or school relationship..." className="pl-9" />
    </div>
    <p className="text-xs text-muted-foreground">Only contacts available through your verified school relationships are shown.</p>
    <ul aria-label="Matching contacts" className="max-h-52 overflow-y-auto divide-y border">
      {matches.map(contact => <li key={contact.personId}>
        <Button variant={value === contact.personId ? "secondary" : "ghost"} disabled={disabled}
          aria-pressed={value === contact.personId} onClick={() => onChange(contact.personId)}
          className="h-auto w-full justify-start whitespace-normal px-3 py-3 text-left">
          {value === contact.personId && <Check aria-hidden="true" />}
          <span className="min-w-0 break-words">{contact.label}</span>
        </Button>
      </li>)}
    </ul>
    {!matches.length && <p role="status" className="text-sm text-muted-foreground">No contacts match your search.</p>}
    <p role="status" className="text-sm">{selected ? `To: ${selected.name}` : "Select a contact to address your message."}</p>
  </section>;
}

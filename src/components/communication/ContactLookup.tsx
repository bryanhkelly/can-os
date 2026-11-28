import {useState} from "react";
import {EntityPicker} from "@/components/workspace/entity-picker";
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
  return <EntityPicker label="Contact lookup" searchLabel="Find a contact"
    searchDescription="Only contacts available through your verified school relationships are shown."
    mode="single-action" options={matches.map(contact=>({id:contact.personId,label:contact.label}))}
    query={query} onQueryChange={setQuery} selected={value?[value]:[]}
    onChange={ids=>{if(ids[0])onChange(ids[0]);}} disabled={disabled}
    resultsClassName="max-h-52 overflow-y-auto"
    empty={<p role="status" className="text-sm text-muted-foreground">No contacts match your search.</p>}
    selectionSummary={selected?`To: ${selected.name}`:"Select a contact to address your message."}/>;
}

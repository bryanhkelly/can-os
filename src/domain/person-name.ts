export type PersonName = {
  preferredName?: string | null;
  legalFirstName?: string | null;
  legalLastName?: string | null;
};

function clean(value: string | null | undefined): string {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

export function personShortName(person: PersonName, fallback = "Unknown person"): string {
  return clean(person.preferredName) || clean(person.legalFirstName) ||
    clean(person.legalLastName) || fallback;
}

export function personDisplayName(person: PersonName, fallback = "Unknown person"): string {
  return [clean(person.preferredName) || clean(person.legalFirstName), clean(person.legalLastName)]
    .filter(Boolean).join(" ") || fallback;
}

/** Official records must never substitute a preferred name for a legal name. */
export function personLegalName(person: PersonName, fallback = "Unknown person"): string {
  return [clean(person.legalFirstName), clean(person.legalLastName)]
    .filter(Boolean).join(" ") || fallback;
}

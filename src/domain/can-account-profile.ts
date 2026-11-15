import { z } from "zod";

const phone = z.string().trim().max(30)
  .refine(value => !value || /^[+0-9 ().-]{7,30}$/.test(value),
    "Enter a valid contact phone number");

export const myCanContactInput = z.object({
  preferredName: z.string().trim().max(80).refine(value => !/[<>\x00-\x1f]/.test(value)),
  phone,
}).strict();

export function accountProfileCanEdit(input: {
  demoAccountSwitching: boolean;
  actorPersonId: string;
  activeGrantId: string;
  grants: readonly { id: string; personId: string }[];
}): boolean {
  return !input.demoAccountSwitching &&
    input.grants.some(grant =>
      grant.id === input.activeGrantId && grant.personId === input.actorPersonId) &&
    new Set(input.grants.map(grant => grant.personId)).size === 1;
}

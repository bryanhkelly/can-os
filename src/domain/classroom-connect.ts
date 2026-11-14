import { normalizeFacilitatedPairingCode } from "./facilitated-learning";

/**
 * A classroom QR/typed link is a pointer to the existing canonical pairing flow,
 * not a credential, attendance claim, or new public-schema session.
 */
export function classroomJoinPath(code: string): string {
  return "/join/" + normalizeFacilitatedPairingCode(code);
}

export function displayClassroomCode(code: string): string {
  const normalized = normalizeFacilitatedPairingCode(code);
  return normalized.slice(0, 5) + "-" + normalized.slice(5);
}

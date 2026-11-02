import { isExtendedLearningType, type ProgramType } from "./program-offerings";

/** Planning a camp does not authorize registration, attendance, or academic credit. */
export function assertExtendedSeasonDraft(input: {
  type: ProgramType;
  status: string;
  creditIssuingOrganizationId: string | null;
  siteId: string | null;
  startsOn: string;
  endsOn: string;
  capacity: number;
}): void {
  if (!isExtendedLearningType(input.type)) throw new Error("Select an extended-learning Program");
  if (input.creditIssuingOrganizationId !== null)
    throw new Error("Credit-bearing summer courses use academic sections, not noncredit activity seasons");
  if (input.status === "closed" || input.status === "paused")
    throw new Error("Program must be open for planning");
  if (!input.siteId) throw new Error("A hosted extended-learning Program requires a Site");
  if (!Number.isSafeInteger(input.capacity) || input.capacity < 1 || input.capacity > 10000)
    throw new Error("Season capacity must be 1 to 10,000");
  for (const [key, value] of [["start", input.startsOn], ["end", input.endsOn]] as const) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Invalid ${key} date`);
    const date = new Date(value + "T00:00:00.000Z");
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
      throw new Error(`Invalid ${key} date`);
  }
  if (input.endsOn < input.startsOn) throw new Error("Season end must not precede its start");
}

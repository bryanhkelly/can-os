export type SlotWindow = {
  startsAt: Date;
  endsAt: Date;
};

/**
 * Materialize fixed-duration slots over [startsAt, endsAt]. A slot is emitted
 * only when it fits entirely within the window (slot end <= endsAt); any
 * trailing remainder shorter than slotMinutes is dropped. Returns an empty
 * array when the window cannot fit a single slot. Callers own domain policy
 * such as minimum slot length or rejecting empty windows.
 */
export function materializeSlots(input: {
  startsAt: Date;
  endsAt: Date;
  slotMinutes: number;
}): SlotWindow[] {
  const { startsAt, endsAt, slotMinutes } = input;
  if (!Number.isFinite(slotMinutes) || slotMinutes <= 0) {
    throw new Error("slotMinutes must be a positive number of minutes");
  }

  const slots: SlotWindow[] = [];
  for (
    let cursor = startsAt.getTime();
    cursor + slotMinutes * 60_000 <= endsAt.getTime();
    cursor += slotMinutes * 60_000
  ) {
    slots.push({
      startsAt: new Date(cursor),
      endsAt: new Date(cursor + slotMinutes * 60_000),
    });
  }
  return slots;
}

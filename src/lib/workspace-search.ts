/**
 * Pure helpers for the workspace command palette: navigation-destination
 * filtering and grouped keyboard navigation. Kept free of React and server
 * imports so the interaction model is unit-testable.
 */
export type PaletteDestination = { to: string; label: string };

export function filterDestinations(
  query: string,
  links: readonly PaletteDestination[],
): PaletteDestination[] {
  const term = query.trim().toLowerCase();
  if (!term) return [...links];
  return links.filter((link) => link.label.toLowerCase().includes(term));
}

export type PaletteGroup<T> = { label: string; items: readonly T[] };

export type FlattenedItem<T> = { group: string; item: T };

/** Custom window event that opens the command palette (avoids component coupling). */
export const openPaletteEvent = "can-os:open-palette";

/** Flatten grouped results into keyboard-navigation order, preserving group labels. */
export function flattenGroups<T>(groups: readonly PaletteGroup<T>[]): FlattenedItem<T>[] {
  return groups.flatMap((group) =>
    group.items.map((item) => ({ group: group.label, item })),
  );
}

/** Wrap-around cursor movement for arrow-key navigation. */
export function moveActiveIndex(current: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return (current + delta + length) % length;
}

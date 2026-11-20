/** Human-readable label for controlled Blueprint keys without mutating identity. */
export function readableBlueprintKey(value: string): string {
  return value.replaceAll("_", " ");
}

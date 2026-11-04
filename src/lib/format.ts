/** "1 class", "3 classes". Pass `many` for irregular plurals. Use instead of "class(es)" copy. */
export function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

/** Verb agreement for a counted subject: `${plural(n, "lesson")} ${agree(n, "has", "have")}`. */
export function agree(count: number, one: string, many: string) {
  return count === 1 ? one : many;
}

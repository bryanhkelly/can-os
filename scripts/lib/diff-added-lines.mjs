/** Inclusive added-line ranges from a zero-context Git diff for a single file. */
export function addedLineRanges(diff) {
  const ranges = [];
  for (const line of diff.split("\n")) {
    const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!match) continue;
    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    if (count > 0) ranges.push([start, start + count - 1]);
  }
  return ranges;
}

export function onAddedLine(ranges, line) {
  return Number.isInteger(line) && ranges.some(([start, end]) => line >= start && line <= end);
}

export type GradebookArrowKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

/** Pure grid navigation; never changes a grade or opens an unauthorized cell. */
export function nextGradebookCell(
  key: string,
  row: number,
  column: number,
  rowCount: number,
  columnCount: number,
): { row: number; column: number } | null {
  const offsets: Record<GradebookArrowKey, readonly [number, number]> = {
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
  };
  if (!(key in offsets)) return null;
  const [rowOffset, columnOffset] = offsets[key as GradebookArrowKey];
  const nextRow = row + rowOffset;
  const nextColumn = column + columnOffset;
  if (nextRow < 0 || nextRow >= rowCount || nextColumn < 0 || nextColumn >= columnCount) return null;
  return { row: nextRow, column: nextColumn };
}

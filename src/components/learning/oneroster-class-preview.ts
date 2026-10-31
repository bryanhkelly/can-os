import { previewOneRosterCsv } from "@/domain/oneroster-csv";

export type RosterClassRow = ReturnType<typeof previewOneRosterCsv>["rows"][number] & {
  sourcedId: string;
};

/** UI preview only. The domain parser and server import remain authoritative. */
export function previewRosterClasses(csv: string): RosterClassRow[] {
  if (!csv.trim()) return [];
  try {
    const preview = previewOneRosterCsv("classes", csv);
    if (preview.errors.length) return [];
    return preview.rows.map((row) => {
      if (!row.sourcedId) throw new Error("A OneRoster class is missing its sourcedId.");
      return { ...row, sourcedId: row.sourcedId };
    });
  } catch {
    // Preserve editable state while a user is entering incomplete CSV.
    return [];
  }
}

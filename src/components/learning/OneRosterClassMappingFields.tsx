export interface OneRosterClassRow { sourcedId: string; title?: string }
export interface OneRosterSectionOption { id: string; code: string; title: string }

export function OneRosterClassMappingFields({
  rows, sections, mappings, busy, onMappingChange, onSave,
}: {
  rows: readonly OneRosterClassRow[];
  sections: readonly OneRosterSectionOption[];
  mappings: Readonly<Record<string, string>>;
  busy: boolean;
  onMappingChange: (sourcedId: string, sectionId: string) => void;
  onSave: () => void;
}) {
  const complete = rows.length > 0 &&
    rows.every(row => sections.some(section => section.id === mappings[row.sourcedId])) &&
    new Set(rows.map(row => mappings[row.sourcedId])).size === rows.length;
  return <div className="space-y-3 rounded border p-3">
    <p className="text-sm font-medium">Match all {rows.length} external classes to the existing classes below.</p>
    {rows.map(row => <label key={row.sourcedId} className="block text-sm">
      {row.title?.trim() || row.sourcedId} ({row.sourcedId})
      <select value={mappings[row.sourcedId] ?? ""} className="mt-1 block w-full rounded border bg-background p-2"
        onChange={event => onMappingChange(row.sourcedId, event.target.value)}>
        <option value="">Select CAN class</option>
        {sections.map(section => <option key={section.id} value={section.id}>{section.code} · {section.title}</option>)}
      </select>
    </label>)}
    <button type="button" className="rounded border px-4 py-2 text-sm font-semibold disabled:opacity-50"
      disabled={busy || !complete} onClick={onSave}>Save class mappings</button>
  </div>;
}

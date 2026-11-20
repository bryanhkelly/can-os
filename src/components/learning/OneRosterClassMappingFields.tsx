import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

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
  const pending = rows.filter(row => !sections.some(section => section.id === mappings[row.sourcedId]));
  const duplicateSections = rows.map(row => mappings[row.sourcedId]).filter(Boolean)
    .filter((id,index,all) => all.indexOf(id) !== index);
  return <div className="space-y-3  border p-3">
    <p className="text-sm font-medium">Match all {rows.length} external classes to the existing classes below.</p>
    {rows.map(row => <Label key={row.sourcedId} className="block text-sm">
      {row.title?.trim() || row.sourcedId} ({row.sourcedId})
      <Select value={mappings[row.sourcedId] ?? ""} className="mt-1 block w-full  border bg-background p-2"
        onChange={event => onMappingChange(row.sourcedId, event.target.value)}>
        <option value="">Select CAN class</option>
        {sections.map(section => <option key={section.id} value={section.id}>{section.code} · {section.title}</option>)}
      </Select>
    </Label>)}
    <p role="status" className="text-xs text-muted-foreground">{complete
      ? "Ready for registrar review: all classes have distinct existing CAN Sections. No student identities or enrollments will be created."
      : `${pending.length} class mappings pending; ${new Set(duplicateSections).size} duplicate Section selections. All mappings must be resolved before saving.`}</p>
    <Button variant="outline" type="button"
      disabled={busy || !complete} onClick={onSave}>Save class mappings</Button>
  </div>;
}

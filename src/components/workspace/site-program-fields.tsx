type Choice = { id: string; name: string };
export type SiteProgramFieldsProps = {
  sites: readonly Choice[];
  programs: readonly (Choice & { siteId: string | null })[];
  siteId: string;
  programId: string;
  onChange: (siteId: string, programId: string) => void;
  sitePlaceholder?: string;
  programPlaceholder: string;
  siteRequired?: boolean;
  programRequired?: boolean;
  disabled?: boolean;
  labelPrefix?: string;
};

export function SiteProgramFields({
  sites, programs, siteId, programId, onChange, sitePlaceholder,
  programPlaceholder, siteRequired, programRequired, disabled, labelPrefix,
}: SiteProgramFieldsProps) {
  const label = (name: string) => labelPrefix ? `${labelPrefix} ${name.toLowerCase()}` : name;
  return <>
    <label className="text-sm">School
      <select aria-label={label("School")} required={siteRequired} disabled={disabled}
        value={siteId} onChange={event => onChange(event.target.value, "")}
        className="mt-1 block w-full rounded border bg-background p-2">
        {sitePlaceholder !== undefined && <option value="">{sitePlaceholder}</option>}
        {sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
      </select>
    </label>
    <label className="text-sm">Program
      <select aria-label={label("Program")} required={programRequired} disabled={disabled}
        value={programId} onChange={event => onChange(siteId, event.target.value)}
        className="mt-1 block w-full rounded border bg-background p-2">
        <option value="">{programPlaceholder}</option>
        {programs.filter(program => !siteId || program.siteId === siteId)
          .map(program => <option key={program.id} value={program.id}>{program.name}</option>)}
      </select>
    </label>
  </>;
}

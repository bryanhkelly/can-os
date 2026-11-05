import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { siteTimezoneOptions } from "@/domain/site-timezone";

export function SiteTimezoneField({
  label = "School time zone",
  value,
  onChange,
  required = true,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return <Field label={label} required={required}>
    <Select value={value} onChange={event => onChange(event.target.value)}>
      <option value="">Choose a time zone...</option>
      {siteTimezoneOptions(value).map(zone => <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>)}
    </Select>
  </Field>;
}
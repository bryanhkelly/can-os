export function LocalDateTimeField({ label, timezone, value, onChange, required, disabled }: {
  label: string;
  timezone: string | undefined;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
}) {
  return <label className="block text-sm">{label} ({timezone || "choose a school or group"})
    <input type="datetime-local" value={value} required={required} disabled={disabled}
      onChange={event => onChange(event.target.value)}
      className="mt-1 block w-full rounded border bg-background p-2" />
  </label>;
}

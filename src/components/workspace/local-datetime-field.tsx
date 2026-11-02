export function LocalDateTimeField({ label, timezone, value, onChange, required, disabled }: {
  label: string;
  timezone: string | undefined;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
}) {
  return <Label className="block">{label} ({timezone || "choose a school or group"})
    <Input type="datetime-local" value={value} required={required} disabled={disabled}
      onChange={event => onChange(event.target.value)}
      className="mt-1" />
  </Label>;
}
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

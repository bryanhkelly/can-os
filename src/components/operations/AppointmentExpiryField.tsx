import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { appointmentExpiryBounds } from "./appointment-expiry";

export function AppointmentExpiryField({ label, value, disabled, onChange }: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const { min, max } = appointmentExpiryBounds();
  return <Field label={label}>
    <Input type="date" disabled={disabled} value={value} min={min} max={max}
      onChange={event => onChange(event.target.value)}/>
  </Field>;
}

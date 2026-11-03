import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { appointmentExpiryBounds } from "./appointment-expiry";

export function AppointmentExpiryField({ label, value, disabled, onChange }: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return <Field label={label}>
    <Input type="date" disabled={disabled} value={value} {...appointmentExpiryBounds()}
      onChange={event => onChange(event.target.value)}/>
  </Field>;
}

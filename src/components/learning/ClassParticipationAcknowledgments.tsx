import { Checkbox } from "@/components/ui/choice";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Reused by Class discovery, approved invitations, and learner transfers.
 * These are acknowledgments only; enrollment authority stays server-side.
 */
export function ClassParticipationAcknowledgments({
  adultChecked, consentChecked, onAdultChange, onConsentChange,
  adultLabel, consentLabel, className,
}: {
  adultChecked: boolean;
  consentChecked: boolean;
  onAdultChange: (checked: boolean) => void;
  onConsentChange: (checked: boolean) => void;
  adultLabel: string;
  consentLabel: string;
  className?: string;
}) {
  return <div role="group" aria-label="Class participation acknowledgments"
    className={cn("space-y-3", className)}>
    <Label className="flex items-start gap-3 text-sm">
      <Checkbox className="mt-1" checked={adultChecked}
        onChange={event => onAdultChange(event.target.checked)} />
      <span>{adultLabel}</span>
    </Label>
    <Label className="flex items-start gap-3 text-sm">
      <Checkbox className="mt-1" checked={consentChecked}
        onChange={event => onConsentChange(event.target.checked)} />
      <span>{consentLabel}</span>
    </Label>
  </div>;
}

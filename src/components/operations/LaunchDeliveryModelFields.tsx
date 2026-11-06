import { LaunchFieldHelp } from "@/components/launch-studio/LaunchFieldHelp";
import { Checkbox } from "@/components/ui/choice";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LaunchDeliveryModelFields({ onsite, setOnsite, liveOnline, setLiveOnline, asynchronous, setAsynchronous, onsiteDaysPerWeek, setOnsiteDaysPerWeek }: {
  onsite: boolean; setOnsite: (value: boolean) => void;
  liveOnline: boolean; setLiveOnline: (value: boolean) => void;
  asynchronous: boolean; setAsynchronous: (value: boolean) => void;
  onsiteDaysPerWeek: string; setOnsiteDaysPerWeek: (value: string) => void;
}) {
  return (
              <fieldset>
                <legend className="text-sm text-muted-foreground">
                  How students will learn
                </legend>
                <div className="mt-2 flex flex-wrap gap-4 text-sm">
                  <Label className="flex min-h-11 items-center gap-2 rounded-lg border px-3">
                    <Checkbox checked={onsite} onChange={(e) => setOnsite(e.target.checked)} />
                    In person
                  </Label>
                  <Label className="flex min-h-11 items-center gap-2 rounded-lg border px-3">
                    <Checkbox checked={liveOnline} onChange={(e) => setLiveOnline(e.target.checked)} />
                    Scheduled live teaching (optional)
                  </Label>
                  <Label className="flex min-h-11 items-center gap-2 rounded-lg border px-3">
                    <Checkbox checked={asynchronous} onChange={(e) => setAsynchronous(e.target.checked)} />
                    Recorded or self-paced learning
                  </Label>
                  {onsite && (
                    <Label className="flex items-center gap-2 text-xs">
                      In-person days per week
                      <Input
                        aria-label="Onsite days per week"
                        type="number"
                        min={1}
                        max={7}
                        className="w-20 rounded-lg border bg-background p-2 text-sm"
                        value={onsiteDaysPerWeek}
                        onChange={(e) => setOnsiteDaysPerWeek(e.target.value)}
                      />
                    </Label>
                  )}
                </div>
                <LaunchFieldHelp label="About learning formats">
                  Choose the formats this Program actually offers. Recorded or self-paced learning does not require a live lecture. Scheduled live teaching means a real-time class, not live help for questions. For asynchronous instruction with live support only, leave scheduled live teaching off. In-person days and teaching schedules are configured separately.
                </LaunchFieldHelp>
              </fieldset>
  );
}

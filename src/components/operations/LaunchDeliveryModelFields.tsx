import { LaunchFieldHelp } from "@/components/launch-studio/LaunchFieldHelp";
import { Checkbox } from "@/components/ui/choice";
import { Input } from "@/components/ui/input";

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
                  <label className="flex min-h-11 items-center gap-2 rounded-lg border px-3">
                    <Checkbox checked={onsite} onChange={(e) => setOnsite(e.target.checked)} />
                    In person
                  </label>
                  <label className="flex min-h-11 items-center gap-2 rounded-lg border px-3">
                    <Checkbox checked={liveOnline} onChange={(e) => setLiveOnline(e.target.checked)} />
                    Live online
                  </label>
                  <label className="flex min-h-11 items-center gap-2 rounded-lg border px-3">
                    <Checkbox checked={asynchronous} onChange={(e) => setAsynchronous(e.target.checked)} />
                    At your own pace
                  </label>
                  {onsite && (
                    <label className="flex items-center gap-2 text-xs">
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
                    </label>
                  )}
                </div>
                <LaunchFieldHelp label="About learning formats">
                  Choose every format you plan to offer. Live online means classes with a teacher at a scheduled time;
                  at your own pace means learning without a live class. Days per week are planning only; set your actual calendar in Academics.
                </LaunchFieldHelp>
              </fieldset>
  );
}

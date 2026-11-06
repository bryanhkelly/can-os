import { programTypes, isExtendedLearningType } from "@/domain/program-offerings";
import { suggestedLaunchSlug } from "@/domain/launch-slug";
import { launchGradeRangeIsOrdered } from "@/domain/launch-grade-range";
import { LaunchFieldHelp } from "@/components/launch-studio/LaunchFieldHelp";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/choice";

const grades = ["TK", "K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
const inputClass = "mt-1 block w-full rounded-lg border bg-background p-2 text-sm";
const selectClass = inputClass;

export function LaunchProgramIdentityFields({ type, summerCreditBearing, setSummerCreditBearing, name, setName, targetOpeningDate, setTargetOpeningDate, slug, setSlug, slugEdited, setSlugEdited, gradeMin, setGradeMin, gradeMax, setGradeMax }: {
  type: (typeof programTypes)[number]; setType: (value: (typeof programTypes)[number]) => void;
  summerCreditBearing: boolean; setSummerCreditBearing: (value: boolean) => void;
  name: string; setName: (value: string) => void;
  targetOpeningDate: string; setTargetOpeningDate: (value: string) => void;
  slug: string; setSlug: (value: string) => void;
  slugEdited: boolean; setSlugEdited: (value: boolean) => void;
  gradeMin: string; setGradeMin: (value: string) => void;
  gradeMax: string; setGradeMax: (value: string) => void;
}) {
  return (
              <fieldset>
                <legend className="text-sm text-muted-foreground">
                  Name, opening date &amp; grades
                </legend>
                <div className="mt-2 space-y-3">
                  {type === "summer_program" && (
                    <Label className="flex items-center gap-2 text-xs">
                      <Checkbox checked={summerCreditBearing} onChange={e => setSummerCreditBearing(e.target.checked)} />
                      Students can earn academic credit
                    </Label>
                  )}
                  {isExtendedLearningType(type) && <p className="text-sm text-muted-foreground">Summer and after-school offerings still need staffing and opening review.</p>}
                  <Label className="block text-xs">
                    School or offering name
                    <Input aria-label="School or offering name" className={inputClass} value={name} onChange={(e) => {
                      const value = e.target.value;
                      setName(value);
                      if (!slugEdited) setSlug(suggestedLaunchSlug(value));
                    }} required minLength={2} maxLength={200} placeholder="e.g., Barton Academy" />
                  </Label>
                  <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                  <Label className="block text-xs">
                    Planned opening date
                    <Input aria-label="Planned opening date" type="date" required value={targetOpeningDate}
                      onChange={event => setTargetOpeningDate(event.target.value)} className={inputClass}/>
                  </Label>
                  <LaunchFieldHelp label="About the planned opening date">This is your target date, not permission to open. Your school's opening approval is reviewed separately.</LaunchFieldHelp>
                  </div>
                  <div>
                  <Label className="block text-xs">
                    Offering short name
                    <Input aria-label="Offering short name" className={inputClass} value={slug} onChange={(e) => {
                      setSlugEdited(true);
                      setSlug(e.target.value);
                    }} required pattern="[a-z0-9]+(-[a-z0-9]+)*" title="Use lowercase letters, numbers and single hyphens." placeholder="barton-academy" />
                  </Label>
                  <LaunchFieldHelp label="About the offering short name">A short identifier for this offering, suggested from its name. Use lowercase letters, numbers and single hyphens. This does not set or publish your website address.</LaunchFieldHelp>
                  </div>
                  </div>
                  <div className="flex gap-3">
                    <Label className="block flex-1 text-xs">
                      Lowest grade served
                      <Select aria-label="Minimum grade" className={selectClass} value={gradeMin} onChange={(e) => setGradeMin(e.target.value)}>
                        {grades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                      </Select>
                    </Label>
                    <Label className="block flex-1 text-xs">
                      Highest grade served
                      <Select aria-label="Maximum grade" className={selectClass} value={gradeMax} onChange={(e) => setGradeMax(e.target.value)}>
                        {grades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                      </Select>
                    </Label>
                  </div>
                  {!launchGradeRangeIsOrdered({min:gradeMin,max:gradeMax})&&
                    <p role="alert" className="text-sm text-destructive">
                      Minimum grade cannot come after maximum grade.
                    </p>}
                </div>
              </fieldset>
  );
}

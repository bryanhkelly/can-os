import { programTypes, programTypeLabels, isExtendedLearningType } from "@/domain/program-offerings";
import { suggestedLaunchSlug } from "@/domain/launch-slug";

const grades = ["TK", "K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
const inputClass = "mt-1 block w-full rounded-lg border bg-background p-2 text-sm";
const selectClass = inputClass;

export function LaunchProgramIdentityFields({ type, setType, summerCreditBearing, setSummerCreditBearing, name, setName, targetOpeningDate, setTargetOpeningDate, slug, setSlug, slugEdited, setSlugEdited, gradeMin, setGradeMin, gradeMax, setGradeMax }: {
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
                <legend className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Program
                </legend>
                <div className="mt-2 space-y-3">
                  <label className="block text-xs">
                    Program type
                    <select aria-label="Program type" className={selectClass} value={type} onChange={(e) => setType(e.target.value as (typeof programTypes)[number])}>
                      {programTypes.map((value) => (
                        <option key={value} value={value}>{programTypeLabels[value]}</option>
                      ))}
                    </select>
                  </label>
                  {type === "summer_program" && (
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={summerCreditBearing} onChange={e => setSummerCreditBearing(e.target.checked)} />
                      Offer credit-bearing summer coursework (requires an authorized credit issuer)
                    </label>
                  )}
                  {isExtendedLearningType(type) && <p className="text-xs text-muted-foreground">Summer and after-school offerings share the Program record. Existing academic-year, section, staffing and opening gates still apply; short-course registration and recurring-session operations need further integration.</p>}
                  <label className="block text-xs">
                    Name
                    <input aria-label="Program name" className={inputClass} value={name} onChange={(e) => {
                      const value = e.target.value;
                      setName(value);
                      if (!slugEdited) setSlug(suggestedLaunchSlug(value));
                    }} required maxLength={200} />
                  </label>
                  <label className="block text-xs">
                    Target opening date
                    <input aria-label="Target opening date" type="date" required value={targetOpeningDate}
                      onChange={event => setTargetOpeningDate(event.target.value)} className={inputClass}/>
                    <span className="mt-1 block text-muted-foreground">Planning only. Your school still needs independent opening approval.</span>
                  </label>
                  <label className="block text-xs">
                    Slug
                    <input aria-label="Program slug" className={inputClass} value={slug} onChange={(e) => {
                      setSlugEdited(true);
                      setSlug(e.target.value);
                    }} required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="grace-academy-hs" />
                  </label>
                  <div className="flex gap-3">
                    <label className="block flex-1 text-xs">
                      Grade range min
                      <select aria-label="Minimum grade" className={selectClass} value={gradeMin} onChange={(e) => setGradeMin(e.target.value)}>
                        {grades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                      </select>
                    </label>
                    <label className="block flex-1 text-xs">
                      Grade range max
                      <select aria-label="Maximum grade" className={selectClass} value={gradeMax} onChange={(e) => setGradeMax(e.target.value)}>
                        {grades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                      </select>
                    </label>
                  </div>
                </div>
              </fieldset>
  );
}

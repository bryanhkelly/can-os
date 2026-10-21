import { useEffect, useId, useRef, useState } from "react";
import {
  applicationGrades, applicationPacketFieldIssues, emptyApplicationContact, emptyApplicationHousehold,
  emptyApplicationPacket, familyApplicationDetails, packetSections,
  type ApplicationFieldIssue, type ApplicationPacket, type FamilyApplicationDetails,
} from "@/domain/application-packet";
import { ApplicationPacketReview } from "./ApplicationPacketReview";

type SavedApplication = {
  firstName: string; lastName: string; gradeLevel: string | null; statement: string;
  packet: ApplicationPacket | null;
};
type Step = "instructions" | "student" | "family" | "history" | "review";
const steps: { key: Step; title: string }[] = [
  { key: "instructions", title: "Instructions" }, ...packetSections, { key: "review", title: "Review and submit" },
];
const inputClass = "mt-1 block w-full rounded-lg border bg-background px-3 py-2";
function PacketInput({ label, path, value, onChange, issues, type = "text", maxLength = 200, rows, optional = false, placeholder }: {
  label: string; path: string; value: string; onChange: (value: string) => void;
  issues: ApplicationFieldIssue[]; type?: string; maxLength?: number; rows?: number; optional?: boolean; placeholder?: string;
}) {
  const id = useId();
  const issue = issues.find(issue => issue.path === path);
  const props = {
    id, value, maxLength, placeholder, "data-application-field": path,
    "aria-required": !optional, "aria-invalid": Boolean(issue), "aria-describedby": issue ? `${id}-error` : undefined,
    className: `${inputClass}${issue ? " border-red-600 ring-1 ring-red-600" : ""}`,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value),
  };
  return <div><label htmlFor={id}>{label}</label>
    {rows ? <textarea {...props} rows={rows}/> : <input {...props} type={type}/>}
    {issue && <p id={`${id}-error`} className="mt-1 text-sm text-red-700 dark:text-red-400">{issue.message}</p>}
  </div>;
}
export function ApplicationPacketEditor({ application, busy, open, gradeRange, onSave, onSubmit, onNew, onDirtyChange }: {
  application: SavedApplication | null; busy: boolean; open: boolean;
  gradeRange?: { min: string; max: string };
  onSave: (details: FamilyApplicationDetails) => Promise<void>;
  onSubmit: (details?: FamilyApplicationDetails) => Promise<void>; onNew: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const initial = {
    studentFirstName: application?.firstName ?? "", studentLastName: application?.lastName ?? "",
    gradeLevel: applicationGrades.find(grade => grade === application?.gradeLevel) ??
      applicationGrades.find(grade => grade === gradeRange?.min) ?? "9",
    statement: application?.statement ?? "", packet: application?.packet ?? emptyApplicationPacket(),
  };
  const [details, setDetails] = useState(initial);
  const [saved, setSaved] = useState(application ? JSON.stringify(initial) : "");
  const [step, setStep] = useState<Step>("student");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const editor = useRef<HTMLDivElement>(null);
  const firstSchoolId = useId();
  const packet = details.packet;
  const issues = applicationPacketFieldIssues(packet, details.statement);
  if (!details.studentFirstName.trim()) issues.unshift({ path: "studentFirstName", section: "student", message: "Enter the student first name." });
  if (!details.studentLastName.trim()) issues.unshift({ path: "studentLastName", section: "student", message: "Enter the student last name." });
  const parsedDetails = familyApplicationDetails.safeParse(details);
  if (!parsedDetails.success) for (const issue of parsedDetails.error.issues) {
    if (issue.path[0] !== "packet" && !issues.some(item => item.path === issue.path.join(".")))
      issues.push({ path: issue.path.join("."), section: issue.path[0] === "statement" ? "history" : "student", message: issue.message });
  }
  const firstSchoolIssue = issues.find(issue => issue.path === "history.firstSchool" || issue.path === "history.schools");
  const dirty = application ? JSON.stringify(details) !== saved : JSON.stringify(details) !== JSON.stringify(initial);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  const completed = packetSections.filter(section => !issues.some(issue => issue.section === section.key)).length;
  function navigate(next: Step, path?: string) {
    setStep(next);
    requestAnimationFrame(() => {
      const target = path ? editor.current?.querySelector<HTMLElement>(`[data-application-field="${path === "history.schools" ? "history.firstSchool" : path}"]`) : heading.current;
      (target ?? heading.current)?.scrollIntoView({ block: "center" });
      (target ?? heading.current)?.focus({ preventScroll: true });
    });
  }
  function changePacket(next: ApplicationPacket) { setDetails({ ...details, packet: next }); setConfirmed(false); }
  function household(index: number, next: ApplicationPacket["households"][number]) {
    changePacket({ ...packet, households: packet.households.map((item, i) => i === index ? next : item) });
  }
  async function save() {
    setError("");
    const parsed = familyApplicationDetails.safeParse(details);
    if (!parsed.success) {
      setError("Correct the highlighted invalid fields before saving. Empty fields may be saved as an incomplete draft.");
      const issue = issues.find(item => item.path === parsed.error.issues[0]?.path.join(".").replace(/^packet\./, ""));
      if (issue) navigate(issue.section, issue.path);
      return;
    }
    try {
      await onSave(parsed.data);
      const normalized = { ...details, ...parsed.data, packet: parsed.data.packet ?? packet };
      setDetails(normalized); setSaved(JSON.stringify(normalized)); setConfirmed(false);
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to save application packet"); }
  }
  async function submit() {
    setError("");
    const parsed = familyApplicationDetails.safeParse(details);
    if (!parsed.success || issues.length > 0) {
      const issue = issues[0];
      setError("Complete the highlighted fields before submitting.");
      if (issue) navigate(issue.section, issue.path);
      return;
    }
    try {
      await onSubmit(dirty || !application ? parsed.data : undefined);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to submit application");
    }
  }
  return <div ref={editor} className="mt-6 overflow-hidden rounded-xl border bg-card">
    <div className="border-b p-5">
      <h2 className="font-serif text-2xl">{application ? "Edit application draft" : "Start an application"}</h2>
      <p className="mt-2 text-sm text-muted-foreground">Core application packet · {completed} of 3 sections ready
        {dirty ? " · Unsaved changes" : " · Saved"}</p>
      <progress aria-label="Core application completion" value={completed} max={3} className="mt-3 h-2 w-full"/>
    </div>
    <div className="grid md:grid-cols-[15rem_minmax(0,1fr)]">
      <nav aria-label="Application sections" className="space-y-1 border-b bg-muted/30 p-3 md:border-b-0 md:border-r">
        {steps.map(item => <button key={item.key} type="button" disabled={busy}
          aria-current={step === item.key ? "step" : undefined} onClick={() => navigate(item.key)}
          className={`block w-full rounded-lg px-3 py-3 text-left text-sm ${step === item.key ? "bg-foreground text-background" : "hover:bg-muted"}`}>
          <span className="block font-semibold">{item.title}</span>
          {item.key !== "instructions" && item.key !== "review" && <span className="mt-1 block text-xs">
            {issues.some(issue => issue.section === item.key) ? `${issues.filter(issue => issue.section === item.key).length} item(s) needed` : "Ready"}
          </span>}
        </button>)}
        <p className="px-3 pt-4 text-xs text-muted-foreground">Save your progress before leaving. You can return to an unfinished application.</p>
      </nav>
      <div className="min-w-0 space-y-5 p-5 sm:p-6">
        <h3 ref={heading} tabIndex={-1} className="scroll-mt-24 font-serif text-2xl">{steps.find(item => item.key === step)?.title}</h3>
        {error && <p role="alert" className="rounded-lg border border-red-500 p-3 text-sm">{error}</p>}
        {!open && <p role="alert">This program is no longer accepting applications. Your saved draft remains available; contact the school.</p>}
        <fieldset disabled={busy || !open} className="min-w-0 space-y-5">
        {step !== "instructions" && step !== "review" && issues.some(issue => issue.section === step) && <div className="rounded-lg border p-3 text-sm">
          <p className="font-semibold">This section still needs:</p>
          <ul className="mt-1 list-inside list-disc">{issues.filter(issue => issue.section === step).map(issue =>
            <li key={issue.path}><button type="button" onClick={() => navigate(issue.section, issue.path)} className="text-left underline">{issue.message}</button></li>)}</ul>
        </div>}
        {step === "instructions" && <div className="space-y-4 text-sm">
          <p>Complete Student information, Family and households, and Previous schools and interests. You may save incomplete sections; required information is checked before submission.</p>
          <p>Use the section menu to move freely. Review the complete packet and confirm when you are ready to send it to admissions. Submitting also saves your latest changes.</p>
          <p>Requested school year is your entry preference, not a reservation or enrollment. Contact and household information is self-reported and does not grant anyone access to school records.</p>
          <p className="rounded-lg border p-3">Documents, acknowledgments, signatures, referrals and payments are not part of this core packet yet. Do not enter medical, financial or identification-document details in free-text fields.</p>
        </div>}
        {step === "student" && <div className="grid gap-4 sm:grid-cols-2">
          <PacketInput label="Student first name" path="studentFirstName" issues={issues} maxLength={100} value={details.studentFirstName} onChange={value => { setDetails({ ...details, studentFirstName: value }); setConfirmed(false); }}/>
          <PacketInput label="Student last name" path="studentLastName" issues={issues} maxLength={100} value={details.studentLastName} onChange={value => { setDetails({ ...details, studentLastName: value }); setConfirmed(false); }}/>
          <PacketInput label="Middle name (optional)" path="student.middleName" issues={issues} optional maxLength={100} value={packet.student.middleName} onChange={value => changePacket({ ...packet, student: { ...packet.student, middleName: value } })}/>
          <PacketInput label="Preferred name (optional)" path="student.preferredName" issues={issues} optional maxLength={100} value={packet.student.preferredName} onChange={value => changePacket({ ...packet, student: { ...packet.student, preferredName: value } })}/>
          <PacketInput label="Date of birth" path="student.birthDate" issues={issues} type="date" value={packet.student.birthDate} onChange={value => changePacket({ ...packet, student: { ...packet.student, birthDate: value } })}/>
          <PacketInput label="Primary language" path="student.primaryLanguage" issues={issues} maxLength={100} value={packet.student.primaryLanguage} onChange={value => changePacket({ ...packet, student: { ...packet.student, primaryLanguage: value } })}/>
          <PacketInput label="Requested school year" path="schoolYear" issues={issues} placeholder="2026-2027" maxLength={9} value={packet.schoolYear} onChange={value => changePacket({ ...packet, schoolYear: value })}/>
          <label>Entering grade<select data-application-field="gradeLevel" aria-required="true" value={details.gradeLevel} onChange={e => {
            const grade = applicationGrades.find(grade => grade === e.target.value);
            if (grade) { setDetails({ ...details, gradeLevel: grade }); setConfirmed(false); }
          }} className={inputClass}>{applicationGrades.filter((_, index) => !gradeRange ||
            index >= applicationGrades.findIndex(grade => grade === gradeRange.min) &&
            index <= applicationGrades.findIndex(grade => grade === gradeRange.max)).map(grade => <option key={grade}>{grade}</option>)}</select></label>
        </div>}
        {step === "family" && <div className="space-y-6">
          <p className="text-sm text-muted-foreground">List the student's households and family contacts. These statements do not verify legal guardianship or create accounts. A second household is optional.</p>
          {packet.households.map((home, index) => <section key={index} aria-label={`Household ${index + 1}`} className="space-y-4 rounded-lg border p-4">
            <h4 className="font-semibold">Household {index + 1}</h4>
            <PacketInput label="Household name" path={`households.${index}.name`} issues={issues} value={home.name} onChange={value => household(index, { ...home, name: value })}/>
            <div className="grid gap-3 sm:grid-cols-2">{([
              ["line1", "Address line 1"], ["line2", "Address line 2 (optional)"], ["city", "City"],
              ["region", "State / province"], ["postalCode", "Postal code"], ["country", "Country"],
            ] as const).map(([key, label]) => <PacketInput key={key} label={label} path={`households.${index}.address.${key}`} issues={issues}
              optional={key === "line2"} maxLength={key === "postalCode" ? 30 : key === "country" ? 100 : 200} value={home.address[key]}
              onChange={value => household(index, { ...home, address: { ...home.address, [key]: value } })}/>)}</div>
            {home.contacts.map((contact, contactIndex) => <fieldset key={contactIndex} aria-label={`Contact ${contactIndex + 1}`} className="space-y-3 border-t pt-3">
              <legend className="px-1 font-semibold">Contact {contactIndex + 1}</legend>
              <div className="grid gap-3 sm:grid-cols-2">{([
                ["firstName", "Contact first name", "text", 100], ["lastName", "Contact last name", "text", 100],
                ["relationship", "Relationship to student", "text", 100], ["email", "Contact email", "email", 254], ["phone", "Contact phone", "tel", 50],
              ] as const).map(([key, label, type, maxLength]) => <PacketInput key={key} label={label} path={`households.${index}.contacts.${contactIndex}.${key}`} issues={issues}
                type={type} maxLength={maxLength} value={contact[key]}
                onChange={value => household(index, { ...home, contacts: home.contacts.map((item, i) => i === contactIndex ? { ...item, [key]: value } : item) })}/>)}</div>
              {contactIndex > 0 && <button type="button" className="text-sm underline" onClick={() => household(index, { ...home, contacts: home.contacts.filter((_, i) => i !== contactIndex) })}>Remove contact {contactIndex + 1}</button>}
            </fieldset>)}
            {home.contacts.length < 4 && <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => household(index, { ...home, contacts: [...home.contacts, emptyApplicationContact()] })}>Add family contact</button>}
            {index > 0 && <button type="button" className="ml-3 text-sm underline" onClick={() => changePacket({ ...packet, households: packet.households.filter((_, i) => i !== index) })}>Remove household {index + 1}</button>}
          </section>)}
          {packet.households.length < 2 && <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => changePacket({ ...packet, households: [...packet.households, emptyApplicationHousehold()] })}>Add second household</button>}
          <section className="space-y-3"><h4 className="font-semibold">Siblings (optional)</h4>
            {packet.siblings.map((sibling, index) => <div key={index} role="group" aria-label={`Sibling ${index + 1}`} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-3">
              {([["name", "Sibling full name"], ["grade", "Sibling grade / age"], ["school", "Sibling school or not attending"]] as const).map(([key, label]) =>
                <PacketInput key={key} label={label} path={`siblings.${index}.${key}`} issues={issues} maxLength={key === "grade" ? 30 : 200} value={sibling[key]} onChange={value => changePacket({ ...packet,
                  siblings: packet.siblings.map((item, i) => i === index ? { ...item, [key]: value } : item) })}/>)}
              <button type="button" className="text-left text-sm underline" onClick={() => changePacket({ ...packet, siblings: packet.siblings.filter((_, i) => i !== index) })}>Remove sibling {index + 1}</button>
            </div>)}
            {packet.siblings.length < 10 && <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => changePacket({ ...packet, siblings: [...packet.siblings, { name: "", grade: "", school: "" }] })}>Add sibling</button>}
          </section>
        </div>}
        {step === "history" && <div className="space-y-5">
          <p className="text-sm text-muted-foreground">Tell admissions about prior schooling. This does not import official grades or replace a transcript. Attendance dates are optional.</p>
          <label className="block"><input id={firstSchoolId} data-application-field="history.firstSchool" aria-invalid={Boolean(firstSchoolIssue)}
            aria-describedby={firstSchoolIssue ? `${firstSchoolId}-error` : undefined} className={firstSchoolIssue ? "outline outline-2 outline-red-600" : undefined}
            type="checkbox" checked={packet.history.firstSchool} disabled={packet.history.schools.length > 0}
            onChange={e => changePacket({ ...packet, history: { ...packet.history, firstSchool: e.target.checked } })}/> This is the student's first school</label>
          {firstSchoolIssue && <p id={`${firstSchoolId}-error`} className="text-sm text-red-700 dark:text-red-400">{firstSchoolIssue.message}</p>}
          {packet.history.schools.length > 0 && <p className="text-xs text-muted-foreground">Remove previous school entries before selecting first school.</p>}
          {packet.history.schools.map((school, index) => <section key={index} aria-label={`Previous school ${index + 1}`} className="space-y-3 rounded-lg border p-4">
            <h4 className="font-semibold">Previous school {index + 1}</h4>
            <div className="grid gap-3 sm:grid-cols-2">{([
              ["name", "School name", "text", 200], ["location", "School city / country", "text", 200], ["grade", "Last grade attended", "text", 30],
              ["from", "Attended from (optional)", "date", 10], ["to", "Attended until (optional)", "date", 10],
            ] as const).map(([key, label, type, maxLength]) => <PacketInput key={key} label={label} path={`history.schools.${index}.${key}`} issues={issues}
              optional={key === "from" || key === "to"} type={type} maxLength={maxLength} value={school[key]}
              onChange={value => changePacket({ ...packet, history: { ...packet.history,
                schools: packet.history.schools.map((item, i) => i === index ? { ...item, [key]: value } : item) } })}/>)}</div>
            <PacketInput label="Reason for leaving" path={`history.schools.${index}.reasonForLeaving`} issues={issues} rows={2} maxLength={2000} value={school.reasonForLeaving} onChange={value => changePacket({ ...packet, history: { ...packet.history,
              schools: packet.history.schools.map((item, i) => i === index ? { ...item, reasonForLeaving: value } : item) } })}/>
            <button type="button" className="text-sm underline" onClick={() => changePacket({ ...packet, history: { ...packet.history, schools: packet.history.schools.filter((_, i) => i !== index) } })}>Remove school {index + 1}</button>
          </section>)}
          {!packet.history.firstSchool && packet.history.schools.length < 6 && <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => changePacket({ ...packet, history: { ...packet.history,
            schools: [...packet.history.schools, { name: "", location: "", grade: "", from: "", to: "", reasonForLeaving: "" }] } })}>Add previous school</button>}
          <PacketInput label="Student's learning interests" path="history.learningInterests" issues={issues} rows={3} maxLength={3000} value={packet.history.learningInterests} onChange={value => changePacket({ ...packet, history: { ...packet.history, learningInterests: value } })}/>
          <PacketInput label="Why are you interested in this program?" path="statement" issues={issues} rows={3} maxLength={3000} value={details.statement} onChange={value => { setDetails({ ...details, statement: value }); setConfirmed(false); }}/>
          <PacketInput label="Additional academic context (optional)" path="history.additionalInformation" issues={issues} optional rows={3} maxLength={3000} value={packet.history.additionalInformation} onChange={value => changePacket({ ...packet, history: { ...packet.history, additionalInformation: value } })}/>
        </div>}
        {step === "review" && <div className="space-y-5">
          <p className="font-semibold">{details.studentFirstName} {details.studentLastName} · Entering grade {details.gradeLevel}</p>
          <ApplicationPacketReview packet={packet} statement={details.statement}/>
          {issues.length > 0 && <div className="rounded-lg border border-red-600 p-4"><h4 className="font-semibold">Before you can submit</h4><ul className="mt-2 list-inside list-disc text-sm">
            {issues.map(issue => <li key={issue.path}><button type="button" className="text-left underline" onClick={() => navigate(issue.section, issue.path)}>
              {issue.path.startsWith("households.") ? `Household ${Number(issue.path.split(".")[1]) + 1}: ` : ""}{issue.message}
            </button></li>)}</ul></div>}
          {dirty && issues.length === 0 && <p role="status" className="text-sm">Your latest changes will be saved when you submit.</p>}
          <label className="block text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/> I have reviewed the application and confirm it is ready for admissions review.</label>
          {!confirmed && issues.length === 0 && <p className="text-sm">Select the review confirmation checkbox above, then choose Submit application.</p>}
          <button type="button" disabled={busy || !open || !confirmed || issues.length > 0} className="rounded-lg bg-foreground px-4 py-2 text-background disabled:opacity-50"
            onClick={() => void submit()}>Submit application</button>
          <p className="text-sm text-muted-foreground">Submission saves and sends this packet to admissions. It does not establish guardianship, acceptance or enrollment.</p>
        </div>}
        </fieldset>
        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          <button type="button" disabled={busy || !open} onClick={() => void save()} className="rounded-lg border px-4 py-2 disabled:opacity-50">{busy ? "Working..." : "Save draft"}</button>
          {step !== "review" && <button type="button" disabled={busy} className="rounded-lg border px-4 py-2" onClick={() => navigate(steps[steps.findIndex(item => item.key === step) + 1]!.key)}>Next section</button>}
          {application && <button type="button" disabled={busy} className="text-sm underline"
            onClick={() => { if (!dirty || window.confirm("Discard unsaved changes and start another student application?")) onNew(); }}>Start another student application</button>}
        </div>
      </div>
    </div>
  </div>;
}

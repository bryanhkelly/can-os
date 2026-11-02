import { useEffect, useRef, useState } from "react";
import { searchLifecycleWaitlistStudents } from "@/modules/programs/section-lifecycle.functions";
import { normalizeClientError } from "@/lib/client-error";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function lifecycleStudentLabel(student: { name: string; gradeLevel?: string | null; studentNumber?: string | null }) {
  return [student.name, student.gradeLevel ? `Grade ${student.gradeLevel}` : null,
    student.studentNumber ? `Student #${student.studentNumber}` : null].filter(Boolean).join(" · ");
}

type Results = Awaited<ReturnType<typeof searchLifecycleWaitlistStudents>>;
export function SectionWaitlistPicker({ sectionId, disabled, onAdd }: {
  sectionId: string; disabled: boolean;
  onAdd: (studentProfileId: string, reset: () => void) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, [sectionId]);
  function changeQuery(value: string) {
    request.current++;
    setQuery(value); setResults(null); setSelected(""); setError(""); setLoading(false);
  }
  async function search() {
    const value = query.trim();
    if (disabled || loading || value.length < 2) return;
    const current = ++request.current;
    setLoading(true); setError(""); setSelected(""); setResults(null);
    try {
      const rows = await searchLifecycleWaitlistStudents({ data: { sectionId, query: value } });
      if (current === request.current) setResults(rows);
    } catch (failure) {
      if (current === request.current) setError(normalizeClientError(failure,
        "Unable to search students. Try again.").message);
    } finally {
      if (current === request.current) setLoading(false);
    }
  }
  const selectedStudent = results?.students.find(student => student.studentProfileId === selected);
  return <div className="mt-2 space-y-2" aria-busy={loading}>
    <Field label="Find a student for this waitlist" description="Search by name or student number (at least 2 characters). Only eligible students in this program and school year within your access are shown.">
      <Input value={query} maxLength={100} disabled={disabled} onChange={event => changeQuery(event.target.value)}
        onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void search(); } }}/>
    </Field>
    <Button variant="outline" size="sm" disabled={disabled || loading || query.trim().length < 2}
      onClick={() => void search()}>{loading ? "Searching…" : error ? "Retry student search" : "Find students"}</Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {results && <p role="status" className="text-xs text-muted-foreground">{results.students.length
      ? results.hasMore ? "More than 25 students match. Refine your search to find the right student."
        : `${results.students.length} eligible student${results.students.length === 1 ? "" : "s"} found.`
      : "No eligible students match. Check the name and active program enrollment. Students already enrolled or waitlisted in this class are excluded."}</p>}
    {!!results?.students.length && <Field label="Student to add to waitlist">
      <Select value={selectedStudent?.studentProfileId ?? ""} disabled={disabled || loading}
        onChange={event => setSelected(event.target.value)}>
        <option value="">Choose a student</option>
        {results.students.map(student => <option key={student.studentProfileId} value={student.studentProfileId}>
          {lifecycleStudentLabel(student)}
        </option>)}
      </Select>
    </Field>}
    <Button variant="outline" size="sm" disabled={disabled || loading || !selectedStudent}
      onClick={() => { if (selectedStudent) onAdd(selectedStudent.studentProfileId, () => changeQuery("")); }}>
      Add to waitlist
    </Button>
  </div>;
}

import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { z } from "zod";
import { AdmissionsInquiryForm } from "@/components/admissions/AdmissionsInquiryForm";
import { Checkbox } from "@/components/ui/choice";
import { Label } from "@/components/ui/label";
import { EmptyState, MutationFeedback, WorkspaceShell, secondaryActionClassName } from "@/components/workspace";
import { createAdmissionsInquiry, listAdmissionsExistingStudentsPage, listAdmissionsIntakePrograms } from "@/modules/enrollment/admissions-intake.functions";
import { listPublicAdmissionsInterests } from "@/modules/enrollment/public-admissions-interest.functions";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { LoaderFailure } from "@/lib/loader-failure";
import { optionalSearchString, siteProgramSelectionSchema } from "@/lib/route-search";
import { safeLoader } from "@/lib/safe-loader";
import { useHydrated } from "@/lib/use-hydrated";

const searchSchema = siteProgramSelectionSchema.extend({
  interest: optionalSearchString,
  studentPage: z.number().int().safe().positive().catch(1),
});

export const Route = createFileRoute("/admissions/intake_/new")({
  validateSearch: (search: Record<string, unknown>): { siteId?: string; programId?: string; interest?: string; studentPage?: number } => searchSchema.parse(search),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => safeLoader(async () => {
    const [programs, students, interests] = await Promise.all([
      listAdmissionsIntakePrograms(),
      listAdmissionsExistingStudentsPage({ data: { siteId: deps.siteId, programId: deps.programId, page: deps.studentPage ?? 1 } }),
      deps.interest ? listPublicAdmissionsInterests({ data: { interestId: deps.interest, siteId: deps.siteId, programId: deps.programId } }) : Promise.resolve(null),
    ]);
    return { programs, students, interest: interests?.items.find(interest => interest.id === deps.interest) ?? null };
  }, { authMessage: "Sign in as a registrar to create an admissions inquiry." })(),
  component: NewInquiryPage,
});

function NewInquiryPage() {
  const outcome = Route.useLoaderData();
  const selected = Route.useSearch();
  if (!outcome.ok) return <LoaderFailure eyebrow="Admissions" title="New inquiry" outcome={outcome}/>;
  return <InquiryCreation key={`${selected.siteId ?? ""}:${selected.programId ?? ""}:${selected.interest ?? ""}`} data={outcome.data}/>;
}

function InquiryCreation({ data }: { data: {
  programs: Awaited<ReturnType<typeof listAdmissionsIntakePrograms>>;
  students: Awaited<ReturnType<typeof listAdmissionsExistingStudentsPage>>;
  interest: Awaited<ReturnType<typeof listPublicAdmissionsInterests>>["items"][number] | null;
} }) {
  const selected = Route.useSearch();
  const router = useRouter();
  const interactive = useHydrated();
  const programs = data.programs.filter(program => (!selected.siteId || program.siteId === selected.siteId) &&
    (!selected.programId || program.id === selected.programId));
  const interest = data.interest && (!selected.siteId || data.interest.siteId === selected.siteId) &&
    (!selected.programId || data.interest.programId === selected.programId) ? data.interest : null;
  const convertibleInterest = interest && ["new", "contacted"].includes(interest.status) ? interest : null;
  const [programId, setProgramId] = useState(convertibleInterest?.programId ?? programs[0]?.id ?? "");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [existingApplicationId, setExistingApplicationId] = useState("");
  const [existingStudentKey, setExistingStudentKey] = useState("");
  const [createHouseholdConfirmed, setCreateHouseholdConfirmed] = useState(false);
  const existingStudents = data.students.items.filter(student => student.programId === programId);
  const existingStudent = existingStudents.find(student =>
    `${student.studentProfileId}:${student.guardianPersonId}:${student.householdId ?? "new"}` === existingStudentKey);
  const [studentFirstName, setStudentFirstName] = useState("");
  const [studentLastName, setStudentLastName] = useState("");
  const [guardianFirstName, setGuardianFirstName] = useState(convertibleInterest?.firstName ?? "");
  const [guardianLastName, setGuardianLastName] = useState(convertibleInterest?.lastName ?? "");
  const [guardianEmail, setGuardianEmail] = useState(convertibleInterest?.email ?? "");
  const [gradeLevel, setGradeLevel] = useState(convertibleInterest ? "" : "9");
  const [source, setSource] = useState(convertibleInterest ? "published_site" : "school_direct");
  const [notes, setNotes] = useState(convertibleInterest?.message ?? "");
  const [contactReviewed, setContactReviewed] = useState(false);
  const mutation = useMutationFeedback(() => router.invalidate());
  const busy = mutation.pending || mutation.refreshFailed || !interactive;

  return <WorkspaceShell eyebrow="Admissions" title="New inquiry"
    breadcrumbs={<Link to="/admissions/intake" search={{ siteId: selected.siteId, programId: selected.programId }} className="underline">Admissions pipeline</Link>}
    actions={<Link to="/admissions/intake" search={{ siteId: selected.siteId, programId: selected.programId }} className={secondaryActionClassName}>Cancel</Link>}>
    <MutationFeedback state={mutation} pendingMessage="Creating admissions inquiry..." className="mt-5"/>
    {selected.interest && !interest && <EmptyState title="Public interest unavailable"
      description="This public interest is unavailable in your authorized Site and Program scope."/>}
    {interest && !convertibleInterest && <div role="status" className="mt-5 border p-4 text-sm">
      This public interest is {interest.status}; it cannot be converted again.
      {interest.applicationId && <Link to="/admissions/intake" search={{ siteId: interest.siteId, programId: interest.programId, application: interest.applicationId }}
        className="ml-2 underline">View linked admissions inquiry</Link>}
    </div>}
    {convertibleInterest && <div className="mt-5 space-y-3 border p-4 text-sm">
      <p className="font-semibold">Public request selected · {convertibleInterest.programName}</p>
      <p>Confirm the contact with the family and enter the student's identity. Public contact details do not prove guardianship or confer school access.</p>
      <p>If this student or guardian already has a CAN OS record, cancel this handoff and use ordinary verified intake to avoid duplicate identities.</p>
      <Label className="flex items-start gap-2">
        <Checkbox checked={contactReviewed} disabled={busy} onChange={event => setContactReviewed(event.target.checked)}/>
        I reviewed the adult contact with the family, confirmed the new student's identity and checked that a new unverified intake record is appropriate. Formal guardian verification remains a separate step.
      </Label>
    </div>}
    {(!selected.interest || !!convertibleInterest) && <AdmissionsInquiryForm
      onSubmit={event => {
        event.preventDefault();
        let createdApplicationId = "";
        void mutation.run(async () => {
          if (existingStudentKey && !existingStudent) throw new Error("The selected student is no longer available. Choose a student again.");
          if (existingStudent && !existingStudent.householdId && !createHouseholdConfirmed)
            throw new Error("Confirm creation of the missing household before continuing.");
          if (convertibleInterest && !contactReviewed) throw new Error("Confirm the family contact and student identity before continuing.");
          const created = await createAdmissionsInquiry({ data: existingStudent ? {
            requestId, programId, source, notes, existingStudent: {
              studentProfileId: existingStudent.studentProfileId, guardianPersonId: existingStudent.guardianPersonId,
              ...(existingStudent.householdId ? { householdId: existingStudent.householdId } : { createHousehold: true }),
            },
          } : {
            requestId, programId, ...(existingApplicationId ? { existingApplicationId } : {}), studentFirstName, studentLastName,
            guardianFirstName, guardianLastName, guardianEmail, gradeLevel, source, notes,
            ...(convertibleInterest ? { publicInterestId: convertibleInterest.id, contactReviewed: true as const } : {}),
          } });
          createdApplicationId = created.applicationId;
          setRequestId(crypto.randomUUID());
          setExistingApplicationId("");
          setExistingStudentKey("");
          setCreateHouseholdConfirmed(false);
        }, {
          successMessage: "Inquiry created; continue the normal admissions and enrollment checklist.",
          commandErrorMessage: "Unable to create inquiry",
          refresh: async () => {
            const selectedProgram = data.programs.find(program => program.id === programId);
            await router.navigate({ to: "/admissions/intake", search: {
              siteId: convertibleInterest?.siteId ?? selectedProgram?.siteId ?? undefined,
              programId, application: createdApplicationId,
            } });
            await router.invalidate();
          },
        });
      }}
      programs={programs} programId={programId} setProgramId={setProgramId}
      convertibleInterest={!!convertibleInterest} contactReviewed={contactReviewed} busy={busy}
      existingStudentKey={existingStudentKey} setExistingStudentKey={setExistingStudentKey}
      existingStudents={existingStudents} existingStudent={existingStudent}
      createHouseholdConfirmed={createHouseholdConfirmed} setCreateHouseholdConfirmed={setCreateHouseholdConfirmed}
      existingApplicationId={existingApplicationId} setExistingApplicationId={setExistingApplicationId}
      studentFirstName={studentFirstName} setStudentFirstName={setStudentFirstName}
      studentLastName={studentLastName} setStudentLastName={setStudentLastName}
      guardianFirstName={guardianFirstName} setGuardianFirstName={setGuardianFirstName}
      guardianLastName={guardianLastName} setGuardianLastName={setGuardianLastName}
      guardianEmail={guardianEmail} setGuardianEmail={setGuardianEmail}
      gradeLevel={gradeLevel} setGradeLevel={setGradeLevel} source={source} setSource={setSource}
      notes={notes} setNotes={setNotes} selection={selected} existingStudentHasMore={data.students.nextPage !== null}/>} 
  </WorkspaceShell>;
}
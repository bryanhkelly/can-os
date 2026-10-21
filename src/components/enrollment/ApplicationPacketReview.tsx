import type { ApplicationPacket } from "@/domain/application-packet";

export function ApplicationPacketReview({ packet, statement }: { packet: ApplicationPacket | null; statement: string }) {
  if (!packet) return <p>The core application packet has not been completed. Existing intake information is preserved.</p>;
  return <div className="space-y-6 text-sm">
    <section className="space-y-2"><h3 className="font-semibold">Student information</h3>
      <dl className="grid gap-2 sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Requested school year</dt><dd>{packet.schoolYear || "Not provided"}</dd></div>
        <div><dt className="text-muted-foreground">Date of birth</dt><dd>{packet.student.birthDate || "Not provided"}</dd></div>
        <div><dt className="text-muted-foreground">Middle name</dt><dd>{packet.student.middleName || "Not provided"}</dd></div>
        <div><dt className="text-muted-foreground">Preferred name</dt><dd>{packet.student.preferredName || "Not provided"}</dd></div>
        <div><dt className="text-muted-foreground">Primary language</dt><dd>{packet.student.primaryLanguage || "Not provided"}</dd></div>
      </dl>
    </section>
    <section className="space-y-3"><h3 className="font-semibold">Family and households</h3>
      {packet.households.map((household, index) => <div key={index} className="space-y-2 rounded-lg border p-3">
        <h4 className="font-semibold">Household {index + 1}: {household.name || "Not named"}</h4>
        <p>{[household.address.line1, household.address.line2, household.address.city, household.address.region,
          household.address.postalCode, household.address.country].filter(Boolean).join(", ") || "Address not provided"}</p>
        {household.contacts.map((contact, contactIndex) => <p key={contactIndex}>
          {[contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Contact not named"} · {contact.relationship || "Relationship not provided"}
          <br/>{contact.email || "Email not provided"} · {contact.phone || "Phone not provided"}
        </p>)}
      </div>)}
      <h4 className="font-semibold">Siblings</h4>
      {packet.siblings.length ? <ul className="list-inside list-disc">{packet.siblings.map((sibling, index) =>
        <li key={index}>{sibling.name} · {sibling.grade} · {sibling.school}</li>)}</ul> : <p>No siblings listed.</p>}
      <p className="text-muted-foreground">These are applicant-provided contacts, not verified guardians or authorized accounts.</p>
    </section>
    <section className="space-y-3"><h3 className="font-semibold">Previous schools and interests</h3>
      {packet.history.firstSchool ? <p>This is the student's first school.</p> :
        packet.history.schools.length ? packet.history.schools.map((school, index) => <div key={index} className="space-y-1 rounded-lg border p-3">
          <h4 className="font-semibold">{school.name || "School not named"}</h4>
          <p>{school.location || "Location not provided"} · Last grade: {school.grade || "Not provided"}</p>
          <p>Attendance: {school.from || "Not provided"} to {school.to || "Not provided"}</p>
          <p className="whitespace-pre-wrap">Reason for leaving: {school.reasonForLeaving || "Not provided"}</p>
        </div>) : <p>No previous schools provided.</p>}
      <div><h4 className="font-semibold">Learning interests</h4><p className="whitespace-pre-wrap">{packet.history.learningInterests || "Not provided"}</p></div>
      <div><h4 className="font-semibold">Reason for applying</h4><p className="whitespace-pre-wrap">{statement || "Not provided"}</p></div>
      <div><h4 className="font-semibold">Additional academic context</h4><p className="whitespace-pre-wrap">{packet.history.additionalInformation || "Not provided"}</p></div>
      <p className="text-muted-foreground">School history is self-reported; it is not an official transcript or imported grade record.</p>
    </section>
  </div>;
}

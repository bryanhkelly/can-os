import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { RecordFacts } from "@/components/workspace/record-layout";

export function ChurchApplicationConfirmation({ churchName, siteName, contactEmail }: {
  churchName: string; siteName: string; contactEmail: string;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return <section aria-labelledby="church-request-confirmation" className="space-y-4 border bg-card p-6">
    <h2 id="church-request-confirmation" ref={heading} tabIndex={-1} className="font-serif text-2xl">Request received</h2>
    <p>Keep these submission details for any follow-up with CAN.</p>
    <RecordFacts label="Submitted church application details" columns={1} items={[
      { id: "church", label: "Church", value: churchName },
      { id: "site", label: "Proposed school site", value: siteName },
      { id: "email", label: "Contact email you provided", value: contactEmail },
    ]}/>
    <h3 className="font-semibold">What happens next</h3>
    <ol className="list-decimal space-y-2 pl-5 text-sm">
      <li>CAN reviews the information and independently verifies your authority to represent the church. The team may contact you for more information.</li>
      <li>Watch the email address above, including spam or junk folders. No school-setup invitation is issued at this step.</li>
      <li>If approved, the authorized church leader receives a secure email invitation to begin school setup.</li>
    </ol>
    <p className="text-sm">Review times vary; a response date is not guaranteed. You do not need to submit the application again while waiting.</p>
    <p className="text-sm">Need to correct your email or follow up? <a href="https://can-academy.netlify.app/contact" className="underline">Contact CAN Academy</a> and include your church name and the email you used here. Do not include student records or sensitive identity documents.</p>
    <p className="text-sm text-muted-foreground">Submitting an application does not approve the church, authorize operation, or open enrollment.</p>
    <Link to="/access" className="inline-block underline">Already invited? Sign in</Link>
  </section>;
}

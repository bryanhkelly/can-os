import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source=readFileSync(new URL("../../src/routes/learn.enroll.tsx",import.meta.url),"utf8");
const controller=source.slice(
  source.indexOf("function SelfEnrollmentActionForm("),
  source.indexOf("function SelfEnrollmentConfirmation("),
);
const confirmation=source.slice(
  source.indexOf("function SelfEnrollmentConfirmation("),
  source.indexOf("/** Affiliation is optional"),
);

describe("noncredit self-registration decision and refresh contract",()=>{
  it("scopes consent and command status to a selected release and published consent digest",()=>{
    expect(source).toContain("key={selected.id+\":\"+selected.consentSha256}");
    expect(controller).toContain("const [accepted,setAccepted]=useState(false)");
    expect(controller).toContain("const [adult,setAdult]=useState(false)");
    expect(controller).toContain("const [waitlisted,setWaitlisted]=useState(false)");
    expect(controller).toContain("const [enrolled,setEnrolled]");
    expect(source).not.toContain("useEffect(()=>{setAccepted(false)");
  });

  it("keeps the waitlist and registration writes as independently authorized source commands",()=>{
    expect(controller).toContain("joinNoncreditWaitlist({data:");
    expect(controller).toContain("enrollMyselfInNoncredit({data:");
    expect(controller).toContain("releaseId:release.id");
    expect(controller).toContain("consentVersion:release.consentVersion");
    expect(controller).toContain("consentSha256:release.consentSha256");
    expect(controller).toContain("adultConfirmed:true");
    expect(controller).toContain("acceptedConsent:true");
    expect(controller).toContain("...(referralCode?{referralCode}:{})");
    expect(controller).toContain("...(networkMembershipId?{networkMembershipId}:{})");
  });

  it("keeps a saved enrollment from being reported as a command failure when refresh fails",()=>{
    expect(controller).toContain("useMutationFeedback(async()=>");
    expect(controller).toContain("await Promise.all([");
    expect(controller.match(/throwOnError:true/g)).toHaveLength(2);
    expect(controller).toContain("client.invalidateQueries({queryKey:[\"my-noncredit-waitlist\"]}");
    expect(controller).toContain("client.invalidateQueries({queryKey:[\"my-activity\"]}");
    expect(controller).toContain("const busy=feedback.pending||feedback.refreshFailed");
    expect(controller).toContain("const outcome=await feedback.run(");
    expect(controller).toContain("outcome.status===\"saved\"||outcome.status===\"refresh-failed\"");
    expect(controller).toContain("refreshErrorMessage:");
    expect(controller).not.toContain("setMessageError");
    expect(controller).not.toContain("catch(error)");
  });

  it("shows shared V6.1 feedback and refresh-only retry without resubmitting the command",()=>{
    expect(confirmation).toContain("feedback:ReturnType<typeof useMutationFeedback>");
    expect(confirmation).toContain("<MutationFeedback state={feedback}");
    expect(confirmation).toContain("disabled={!accepted||!adult||busy||waitlisted||waitlistLoading||");
    expect(confirmation).not.toContain("messageError?");
  });
});

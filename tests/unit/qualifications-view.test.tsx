import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { QualificationRecords } from "@/components/profiles/Qualifications";
import type { getQualifications } from "@/modules/profiles/qualifications.functions";

vi.mock("@/modules/profiles/qualifications.functions",()=>({
  beginQualificationUpload:vi.fn(),finishQualificationUpload:vi.fn(),getQualifications:vi.fn(),
  decideQualification:vi.fn(),getQualificationEvidence:vi.fn(),
}));
type Snapshot=Awaited<ReturnType<typeof getQualifications>>;
const snapshot:Snapshot={
  personId:"teacher",canSubmit:true,canReview:false,uploadsEnabled:true,hasMore:false,
  catalog:[{id:"definition",title:"Teaching license"}],jurisdictions:[],
  claims:[{id:"claim",title:"Teaching license",issuerName:"Board",jurisdiction:null,issuedAt:null,expiresAt:null,
    status:"pending",sequence:1,hasEvidence:true,history:[{
      claimId:"claim",sequence:1,decision:"submit",reason:null,occurredAt:"2026-10-19T12:00:00Z",
    }]}],
};
function render(data:Snapshot){
  return renderToStaticMarkup(<QualificationRecords snapshot={data} selection={{}} changed={vi.fn()}/>);
}
describe("qualification submission and review presentation",()=>{
  it("lets teachers submit without presenting self-review controls or eligibility claims",()=>{
    const html=render(snapshot);
    expect(html).toContain("Submit qualification evidence");
    expect(html).toContain("Submit for review");
    expect(html).toContain("Review status: pending");
    expect(html).toContain("Storage verification does not approve");
    expect(html).toContain("Prior claims and review history are retained");
    expect(html).not.toContain(">approve</button>");
    expect(html).not.toContain(">reject</button>");
  });
  it("shows independent review, mandatory reasons and initially disabled approval",()=>{
    const html=render({...snapshot,canSubmit:false,canReview:true});
    expect(html).not.toContain("Submit qualification evidence");
    expect(html).toContain("Get private evidence link");
    expect(html).toContain("I independently reviewed this evidence");
    expect(html).toContain("Review reason");
    expect(html).toContain(">approve</button>");
    expect(html).toContain(">reject</button>");
    expect(html).toContain('disabled=""');
    expect(html).toContain("Immutable review history");
    expect(html).toContain("#1 submit");
  });
  it("offers revocation rather than overwriting a verified claim",()=>{
    const html=render({...snapshot,canSubmit:false,canReview:true,
      claims:snapshot.claims.map(claim=>({...claim,status:"verified",sequence:2}))});
    expect(html).toContain(">revoke</button>");
    expect(html).not.toContain(">approve</button>");
    expect(html).not.toContain("Delete");
    expect(html).not.toContain("Edit credential");
  });
  it("marks expired evidence without rewriting its historical review status",()=>{
    const html=render({...snapshot,claims:snapshot.claims.map(claim=>({...claim,status:"verified",
      expiresAt:"2000-01-01T00:00:00Z"}))});
    expect(html).toContain("Review status: verified - expired");
  });
  it("distinguishes missing catalog, empty claims and truncated history from success",()=>{
    const html=render({...snapshot,catalog:[],claims:[],hasMore:true});
    expect(html).toContain("No supported qualification catalog entries");
    expect(html).toContain("not a verified or eligible status");
    expect(html).toContain("100 most recent claims");
  });
  it("explicitly disables uploads until the deployment storage gate is enabled",()=>{
    const html=render({...snapshot,uploadsEnabled:false});
    expect(html).toContain("uploads are not enabled for this deployment");
    expect(html).toContain("Existing records remain readable");
    expect(html).toContain('disabled=""');
  });
});

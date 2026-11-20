import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GuardianStudentIdentityFields, GuardianTransferAuthorizationFields } from "./GuardianApplicationDetailsFields";
import type { GuardianApplicationTransferRequest } from "@/domain/guardian-application-contracts";

const transfer: GuardianApplicationTransferRequest = {
  id:"transfer-1", studentProfileId:"student-1", originProgramId:"origin-1",
  originSchoolName:"Previous academy", destinationSchoolName:"New academy",
  destinationFamilyStartRequestId:null, destinationFamilyStartProgramId:"program-1",
  originExited:false,
};
describe("Guardian application controlled fields", () => {
  it("keeps existing verified student identity read-only", () => {
    const html=renderToStaticMarkup(<GuardianStudentIdentityFields
      id="application" households={[{id:"household-1",name:"Guardian household"}]}
      studentProfileId="student-1" householdId="household-1"
      firstName="Avery" lastName="Sample" grade="9" attempted={false}
      onHouseholdChange={() => {}} onFirstNameChange={() => {}}
      onLastNameChange={() => {}} onGradeChange={() => {}}/>);
    expect(html).toContain("Student legal first name");
    expect(html).toContain("Guardian household");
    expect(html).toContain("readOnly");
    expect(html).toContain("value=\"Avery\"");
  });

  it("keeps receiving-school and records-release permissions independent", () => {
    const html=renderToStaticMarkup(<GuardianTransferAuthorizationFields
      id="application" studentProfileId="student-1"
      availableTransfers={[transfer]} selectedTransfer={transfer}
      originTransferActionId={transfer.id}
      selectedProgramName="New academy" attempted={true}
      confirmedDestination={true} authorizedDestinationRecords={false}
      onOriginTransferChange={() => {}} onConfirmedDestinationChange={() => {}}
      onRecordsReleaseChange={() => {}} />);
    expect(html).toContain("origin exit");
    expect(html).toContain("records release");
    expect(html).toContain("Authorize records release");
    expect((html.match(/type="checkbox"/g) ?? []).length).toBe(2);
    expect((html.match(/checked=""/g) ?? []).length).toBe(1);
  });

  it("does not offer transfer consent without a selected verified student", () => {
    const html=renderToStaticMarkup(<GuardianTransferAuthorizationFields
      id="application" studentProfileId="" availableTransfers={[transfer]}
      originTransferActionId={transfer.id} attempted={false}
      confirmedDestination={false} authorizedDestinationRecords={false}
      onOriginTransferChange={() => {}} onConfirmedDestinationChange={() => {}}
      onRecordsReleaseChange={() => {}} />);
    expect(html).toBe("");
  });
});

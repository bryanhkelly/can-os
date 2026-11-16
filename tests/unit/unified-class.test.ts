import { describe, expect, it } from "vitest";
import {
  classDefinitionSchema, classOfferingTermsSchema, classEnrollmentRequestSchema,
  mayIssueClassAward, validOfferingProductKind, publisherOfferingLabel, visibleInPublicCatalog,
} from "@/domain/unified-class";

const id = "5d9bd7cb-b6b8-443b-8732-087e7ea6a236";
const aClass = {deploymentId:id,adoptionId:id,offeringVersionId:id,courseVersionId:id,
  operatingOrganizationId:id,siteId:null,title:"AI Literacy Evergreen",deliveryMode:"self_paced" as const};
const terms = {visibility:"private" as const,enrollmentMethods:["assignment"] as const,
  opensAt:null,closesAt:null,capacity:null,consentVersion:null,consentText:null};
const fulfilled = {outcomeRecorded:true,requirementsSatisfied:true,
  learnerEligible:true,issuerAuthorized:true,policyApproved:true,awarded:true};

describe("unified Class and Class Offering contract", () => {
  it("permits an online Class with no physical Site and requires an exact Course version", () => {
    expect(classDefinitionSchema.parse(aClass).courseVersionId).toBe(id);
    expect(classDefinitionSchema.safeParse({...aClass,courseVersionId:undefined}).success).toBe(false);
    expect(classDefinitionSchema.safeParse({...aClass,networkId:id}).success).toBe(false);
  });
  it("supports private assignment and public self enrollment using the same terms", () => {
    expect(classOfferingTermsSchema.parse(terms).visibility).toBe("private");
    expect(classOfferingTermsSchema.safeParse({...terms,visibility:"public",enrollmentMethods:["self","assignment"],
      consentVersion:"v1-training",consentText:"I accept the approved Class participation and data processing terms."}).success).toBe(true);
    expect(visibleInPublicCatalog("private")).toBe(false);
    expect(visibleInPublicCatalog("unlisted")).toBe(false);
    expect(visibleInPublicCatalog("public")).toBe(true);
  });
  it("validates optional registration windows and seat counts", () => {
    expect(classOfferingTermsSchema.safeParse({...terms,capacity:0}).success).toBe(false);
    expect(classOfferingTermsSchema.safeParse({...terms,enrollmentMethods:["self","self"]}).success).toBe(false);
    expect(classOfferingTermsSchema.safeParse({...terms,enrollmentMethods:["self"]}).success).toBe(false);
    expect(classOfferingTermsSchema.safeParse({...terms,
      opensAt:"2027-01-20T10:00:00-08:00",closesAt:"2027-01-15T10:00:00-08:00"}).success).toBe(false);
  });
  it("separates credit pursuit from enrollment methods and potential certificates", () => {
    const e={classId:id,classOfferingVersionId:id,learnerPersonId:id,enrollmentMethod:"assignment"};
    for(const creditMode of ["for_credit","audit","not_applicable"]) {
      expect(classEnrollmentRequestSchema.safeParse({...e,creditMode}).success).toBe(true);
    }
  });
  it("requires explicit publisher classification", () => {
    expect(validOfferingProductKind("course",1,false)).toBe(true);
    expect(validOfferingProductKind("course",2,false)).toBe(false);
    expect(validOfferingProductKind("course",1,true)).toBe(false);
    expect(validOfferingProductKind("program",3,false)).toBe(true);
    expect(validOfferingProductKind("program",0,false)).toBe(false);
    expect(publisherOfferingLabel("course")).toBe("Course Offering");
    expect(publisherOfferingLabel("program")).toBe("Program Offering");
  });
  it("allows mastery without credit for an auditing learner", () => {
    expect(mayIssueClassAward(fulfilled,"audit","academic_credit")).toBe(false);
    expect(mayIssueClassAward(fulfilled,"for_credit","academic_credit")).toBe(true);
    expect(mayIssueClassAward({...fulfilled,issuerAuthorized:false},"for_credit","academic_credit")).toBe(false);
    expect(mayIssueClassAward({...fulfilled,policyApproved:false},"for_credit","academic_credit")).toBe(false);
    expect(mayIssueClassAward({...fulfilled,awarded:false},"for_credit","academic_credit")).toBe(false);
    expect(mayIssueClassAward(fulfilled,"audit","certificate")).toBe(true);
    expect(mayIssueClassAward(fulfilled,"not_applicable","participation")).toBe(true);
  });
});

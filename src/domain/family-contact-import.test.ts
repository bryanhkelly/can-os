import { describe, expect, it } from "vitest";
import { parseFamilyContacts } from "./family-contact-import";

describe("family contact import",()=>{
  it("accepts plain addresses, display names, and CSV rows",()=>{
    const result=parseFamilyContacts("john@example.com\nMary Jones <mary@example.com>\nJane Smith,jane@example.com");
    expect(result.contacts).toHaveLength(3);
    expect(result.contacts[1]).toMatchObject({firstName:"Mary",lastName:"Jones",email:"mary@example.com"});
    expect(result.contacts[2]).toMatchObject({firstName:"Jane",lastName:"Smith"});
  });
  it("keeps valid contacts when other rows are malformed",()=>{
    const result=parseFamilyContacts("bad address\nvalid@example.com\nNo Email,");
    expect(result.contacts.map(c=>c.email)).toEqual(["valid@example.com"]);
    expect(result.issues).toHaveLength(2);
  });
  it("deduplicates case-insensitively within the import and against existing emails",()=>{
    const result=parseFamilyContacts("ALREADY@example.com\nnew@example.com\nNEW@example.com",["already@example.com"]);
    expect(result.contacts.map(c=>c.email)).toEqual(["new@example.com"]);
    expect(result.duplicates).toBe(2);
  });
  it("supports first and last name columns in church CSV exports",()=>{
    const result=parseFamilyContacts("First Name,Last Name,Email,Phone\nJane,Doe,jane@example.com,555-0100");
    expect(result.contacts).toEqual([{firstName:"Jane",lastName:"Doe",email:"jane@example.com",phone:"555-0100"}]);
  });
  it("ignores blank rows and basic CSV headers",()=>{
    const result=parseFamilyContacts("Name,Email\n\nJohn Doe,john@example.com");
    expect(result.contacts).toHaveLength(1);
    expect(result.issues).toHaveLength(0);
  });
});

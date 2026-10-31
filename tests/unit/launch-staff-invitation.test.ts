import { describe, expect, it } from "vitest";
import { launchStaffInvitationDefaults } from "../../src/domain/launch-staff-invitation";

describe("launch staff invitation navigation", () => {
  const sites = [{id:"a"},{id:"b"}];
  it("selects the requested authorized Site and setup role", () => {
    expect(launchStaffInvitationDefaults(sites,{siteId:"b",inviteRole:"registrar"}))
      .toEqual({siteId:"b",role:"registrar",unavailable:false});
  });
  it("selects the website editor without granting a registrar role", () => {
    expect(launchStaffInvitationDefaults(sites,{siteId:"a",inviteRole:"site_website_editor"}).role)
      .toBe("site_website_editor");
  });
  it("does not silently replace an unavailable Site with the sole permitted Site", () => {
    expect(launchStaffInvitationDefaults([{id:"a"}],{siteId:"other",inviteRole:"registrar"}))
      .toEqual({siteId:"",role:"registrar",unavailable:true});
  });
  it("requires a choice when more than one Site is available", () => {
    expect(launchStaffInvitationDefaults(sites,{}).siteId).toBe("");
  });
  it("suggests the sole Site and ignores unsupported role proposals", () => {
    expect(launchStaffInvitationDefaults([{id:"a"}],{inviteRole:"can_network_steward"}))
      .toEqual({siteId:"a",role:"teacher",unavailable:false});
  });
});

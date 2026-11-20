import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  NativeApprovedOfferingsPanel, type AuthorizedOfferingGroup,
} from "./NativeApprovedOfferingsPanel";

vi.mock("@tanstack/react-router", () => ({
  Link: ({to,children,params:_params,search:_search}: {
    to:string;children:ReactNode;params?:unknown;search?:unknown;
  })=><a href={to}>{children}</a>,
}));
const groups=[{
  id:"adoption:offering:one",
  first:{offeringKind:"program",offeringVersionNo:2,
    offeringTitle:"Community AI foundations",deploymentName:"COGIC pilot"},
  components:[{courseVersionId:"course-one",courseVersionNo:1,
    courseTitle:"Introduction to digital tools",isRequired:true,
    siteOptions:[{id:"site-one"}],deploymentId:"deployment-one",
    offeringVersionId:"offering-one"}],
}] as unknown as AuthorizedOfferingGroup[];

const defaults = {
  groups, classes:[], search:"", searchDraft:"",
  loaded:true, hasNextPage:false, loadingMore:false,
  onSearchDraftChange:()=>{},onSearch:()=>{},onClear:()=>{},
  onConfigureCourse:()=>{},onLoadMore:()=>{},
};

describe("shared native offering hierarchy", () => {
  it("renders verified adoption and Course components without inventing school readiness", () => {
    const html=renderToStaticMarkup(<NativeApprovedOfferingsPanel {...defaults}/>);
    expect(html).toContain("Community AI foundations");
    expect(html).toContain("Introduction to digital tools");
    expect(html).toContain("COGIC pilot");
    expect(html).toContain("Configure Class");
    expect(html).toContain("Publisher content is read-only");
  });
  it("distinguishes an empty authorized read from loading", () => {
    const html=renderToStaticMarkup(<NativeApprovedOfferingsPanel
      {...defaults} groups={[]} loaded={true} />);
    expect(html).toContain("No approved published Course adoption");
  });
  it("retains the paginated catalog boundary", () => {
    const html=renderToStaticMarkup(<NativeApprovedOfferingsPanel
      {...defaults} hasNextPage={true} loadingMore={true}/>);
    expect(html).toContain("Loading…");
    expect(html).toContain("disabled");
  });
});

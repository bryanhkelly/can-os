import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ExtendedSeasonDraftForm, type ExtendedSeasonDraftValues,
} from "./ExtendedSeasonDraftForm";

const empty: ExtendedSeasonDraftValues={
  programId:"",offeringName:"",seasonName:"",activityType:"other",
  startsOn:"",endsOn:"",capacity:24,
};
const defaults={
  value:empty,selectable:[],busy:false,attempted:false,
  onChange:()=>{},onSubmit:()=>{},
};
describe("shared extended-learning season draft", () => {
  it("requires an eligible Program and keeps registration closed", () => {
    const html=renderToStaticMarkup(<ExtendedSeasonDraftForm {...defaults}/>);
    expect(html).toContain("Create a hosted noncredit summer or after-school Program");
    expect(html).toContain("Save draft season");
    expect(html).not.toContain("Publish registration");
  });
  it("renders draft validation without implying approved operation", () => {
    const html=renderToStaticMarkup(<ExtendedSeasonDraftForm
      {...defaults} attempted={true} value={{...empty,capacity:0}} />);
    expect(html).toContain("Choose an eligible noncredit program");
    expect(html).toContain("Enter an offering name");
    expect(html).toContain("Enter a whole number from 1 to 10,000");
  });
});

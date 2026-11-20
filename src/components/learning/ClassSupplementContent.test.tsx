import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ClassSupplementContent, type ClassSupplement } from "./ClassSupplementContent";

vi.mock("@/components/learning/ClassVideoPlayer", () => ({
  ClassVideoPlayer: ({title}: {title:string})=><div>Video: {title}</div>,
}));
vi.mock("@/components/learning/SafeClassExternalLink", () => ({
  SafeClassExternalLink: ({title}: {title:string})=><span>External: {title}</span>,
}));
vi.mock("@/components/learning/CommonCartridgeStaticLesson", () => ({
  CommonCartridgeStaticLesson: ({resourceId}: {resourceId:string})=><p>Cartridge: {resourceId}</p>,
}));
const props={
  programId:"program-1",sectionId:"section-1",disabled:false,
  loadPrivateUrl:async(_id:string)=>"https://example.org/private",
  onDownload:()=>{},
};
const item=(value:Record<string,unknown>)=>value as ClassSupplement;

describe("Class supplements", () => {
  it("renders video using shared recorded-media UI", () => {
    const html=renderToStaticMarkup(<ClassSupplementContent {...props}
      item={item({id:"s1",title:"Recorded lesson",kind:"video",url:null})}/>);
    expect(html).toContain("Video: Recorded lesson");
  });
  it("renders common-cartridge content without an external link", () => {
    const html=renderToStaticMarkup(<ClassSupplementContent {...props}
      item={item({id:"s2",title:"Worksheet",kind:"html",url:null,resourceId:"r2"})}/>);
    expect(html).toContain("Cartridge: r2");
  });
  it("disables authorized private PDF actions while a command is pending", () => {
    const html=renderToStaticMarkup(<ClassSupplementContent {...props} disabled
      item={item({id:"s3",title:"Private handout",kind:"pdf",url:null})}/>);
    expect(html).toContain("Private handout (private PDF)");
    expect(html).toContain("disabled");
  });
});

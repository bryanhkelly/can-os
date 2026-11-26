import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarketingPackageLibraryList, type MarketingPackageRecord } from "./MarketingPackageLibraryList";

const item={
  id:"package-one",title:"Community open house",status:"draft",
  updatedAt:"2026-11-19T16:00:00.000Z",
  content:{purpose:"promote",formats:["email"]},
} as unknown as MarketingPackageRecord;

describe("shared marketing package library", () => {
  it("shows one saved record and its working-copy actions", () => {
    const html=renderToStaticMarkup(<MarketingPackageLibraryList
      records={[item]} busy={false}
      onOpen={() => {}} onDuplicate={() => {}}
      onArchiveToggle={() => {}} onDelete={() => {}} />);
    expect(html).toContain("Community open house");
    expect(html).toContain("Saved draft");
    expect(html).toContain('aria-label="Duplicate Community open house"');
    expect(html).toContain('aria-label="Archive Community open house"');
  });
  it("offers direct email distribution only for active email outreach", () => {
    const nonEmail={...item,content:{...item.content,formats:["flyer"]}} as MarketingPackageRecord;
    const archived={...item,status:"archived"} as MarketingPackageRecord;
    const render=(record:MarketingPackageRecord)=>renderToStaticMarkup(<MarketingPackageLibraryList records={[record]} busy={false} onOpen={()=>{}} onSendEmail={()=>{}} onDuplicate={()=>{}} onArchiveToggle={()=>{}} onDelete={()=>{}}/>);
    expect(render(item)).toContain("Send Email");
    expect(render(nonEmail)).not.toContain("Send Email");
    expect(render(archived)).not.toContain("Send Email");
  });
  it("labels archived records for restoration without creating new releases", () => {
    const archived={...item,status:"archived"} as MarketingPackageRecord;
    const html=renderToStaticMarkup(<MarketingPackageLibraryList
      records={[archived]} busy={true} onOpen={() => {}} onDuplicate={() => {}}
      onArchiveToggle={() => {}} onDelete={() => {}} />);
    expect(html).toContain("Archived");
    expect(html).toContain('aria-label="Restore Community open house"');
  });
});

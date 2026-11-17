import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NotificationFeed } from "@/components/communication/NotificationFeed";
import type { CenterNotice } from "@/domain/notification-center";

const notice:CenterNotice={
  id:"notice-1",title:"Review recorded assignment",body:"Assigned by school.",
  status:"unread",date:"2026-11-17T19:00:00.000Z",href:"/classes",
};
const callbacks={
  onStatus:()=>undefined,
  onReadAll:()=>undefined,
  onNavigate:()=>undefined,
};
describe("V6.1 notification feed",()=>{
  it("renders source event dates in explicit UTC and keeps the actual unread state",()=>{
    const html=renderToStaticMarkup(<NotificationFeed notices={[notice]} busy={false} {...callbacks}/>);
    expect(html).toContain("Nov 17, 2026, 7:00 PM UTC");
    expect(html).toContain('dateTime="2026-11-17T19:00:00.000Z"');
    expect(html).toContain("1 unread update");
    expect(html).toContain("Unread");
    expect(html).toContain('href="/classes"');
    expect(html).toContain("Mark as read");
    expect(html).not.toContain("Delivered");
  });
  it("uses the canonical empty state without claiming messages were read",()=>{
    const html=renderToStaticMarkup(<NotificationFeed notices={[]} busy={false} {...callbacks}/>);
    expect(html).toContain("No notifications yet.");
    expect(html).toContain('data-empty-kind="records"');
    expect(html).toContain("0 unread updates");
    expect(html).not.toContain("All caught up");
    expect(html).not.toContain("Read all");
  });
});

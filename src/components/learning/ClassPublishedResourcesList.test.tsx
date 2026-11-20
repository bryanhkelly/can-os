import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ClassContent } from "@/domain/class-content";
import { ClassPublishedResourcesList } from "./ClassPublishedResourcesList";

vi.mock("@/components/learning/ClassVideoPlayer", () => ({
  ClassVideoPlayer: ({title}: {title:string})=><div>Video: {title}</div>,
}));
vi.mock("@/components/learning/SafeClassExternalLink", () => ({
  SafeClassExternalLink: ({title}: {title:string})=><span>External: {title}</span>,
}));

type Item=ClassContent["resources"][number];
describe("published Class resource list", () => {
  it("separates external links from downloadable private resources", () => {
    const items=[
      {id:"external-1",title:"Publisher reference",url:"https://example.org/reference"},
      {id:"private-1",title:"Class handout",url:null},
    ] as unknown as Item[];
    const html=renderToStaticMarkup(<ClassPublishedResourcesList
      items={items} disabled={true} onDownload={()=>{}}/>);
    expect(html).toContain("External: Publisher reference");
    expect(html).toContain("Class handout");
    expect(html).toContain("disabled");
    expect(html).toContain('data-learning-resource-id="private-1"');
  });
  it("renders safe supported videos using the existing Class player", () => {
    const items=[{id:"video-1",title:"Lesson video",
      url:"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}] as unknown as Item[];
    const html=renderToStaticMarkup(<ClassPublishedResourcesList
      items={items} disabled={false} onDownload={()=>{}}/>);
    expect(html).toContain("Video: Lesson video");
  });
});

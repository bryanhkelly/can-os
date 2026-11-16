import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { UnifiedLessonOutline } from "@/components/learning/UnifiedLessonOutline";
import { ClassroomMediaSurface } from "@/components/learning/ClassroomMediaSurface";
import { resolveClassVideo } from "@/domain/class-video";

/** Renderer contracts shared across academic, independent, native and projector
 * contexts; neither shared UI primitive grants learner/teacher authorization. */
describe("unified classroom player primitives",()=>{
  it("renders one consistent lesson order with completion and waiver states",()=>{
    const html=renderToStaticMarkup(<UnifiedLessonOutline
      selectedId="lesson-2"
      lessons={[
        {id:"lesson-1",title:"First concept",group:"Unit 1",status:"completed"},
        {id:"lesson-2",title:"Second concept",group:"Unit 1",status:"not_started"},
        {id:"lesson-3",title:"Final concept",group:"Unit 2",status:"waived"},
      ]}
      renderAction={lesson=><span>{lesson.title}</span>}
    />);
    expect(html).toContain("Unit 1");
    expect(html).toContain("Unit 2");
    expect(html.indexOf("First concept")).toBeLessThan(html.indexOf("Second concept"));
    expect(html.indexOf("Second concept")).toBeLessThan(html.indexOf("Final concept"));
    expect(html).toContain("Current");
    expect(html).toContain("Waived");
    expect(html).toContain("Complete");
  });
  it("renders only validated YouTube/Vimeo embed destinations",()=>{
    const youtube=resolveClassVideo("https://youtube.com/watch?v=dQw4w9WgXcQ");
    expect(youtube?.kind).toBe("embed");
    const html=renderToStaticMarkup(<ClassroomMediaSurface
      video={youtube!} title="Course recording"/>);
    expect(html).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(html.toLowerCase()).toContain("no-referrer");
    expect(html).toContain("Course recording");
    expect(html).not.toContain("youtube.com/watch");
  });
  it("uses the same accessible native video surface for Class and projector",()=>{
    const file=resolveClassVideo("https://cdn.example.com/course.webm",true);
    expect(file?.kind).toBe("file");
    const html=renderToStaticMarkup(<ClassroomMediaSurface
      video={file!} title="Class recording"/>);
    expect(html).toContain("<video");
    expect(html).toContain("controls");
    expect(html).toContain("Class recording");
    expect(html).toContain("preload=");
  });
  it("rejects arbitrary or credentialed external frames before playback",()=>{
    expect(resolveClassVideo("https://example.com/iframe",false)).toBeNull();
    expect(resolveClassVideo("https://user:password@youtube.com/watch?v=dQw4w9WgXcQ",true)).toBeNull();
    expect(resolveClassVideo("http://youtube.com/watch?v=dQw4w9WgXcQ",true)).toBeNull();
  });
});

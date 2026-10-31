import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ClassContent } from "@/domain/class-content";
import { PublishedLessonContent } from "./PublishedLessonContent";

type Lesson = ClassContent["modules"][number]["lessons"][number];

describe("PublishedLessonContent", () => {
  it("does not imply an empty lesson is ready for instruction", () => {
    const lesson = {
      body: "", resources: [], activities: [], standards: [], learningTargets: [],
    } as unknown as Lesson;
    expect(renderToStaticMarkup(<PublishedLessonContent lesson={lesson}/>))
      .toContain("No lesson text or activities provided.");
  });
  it("renders reading without changing its text", () => {
    const lesson = {
      body: "Publisher-authored reading", resources: [], activities: [], standards: [], learningTargets: [],
    } as unknown as Lesson;
    const html = renderToStaticMarkup(<PublishedLessonContent lesson={lesson}/>);
    expect(html).toContain("Publisher-authored reading");
    expect(html).toContain("Publisher lesson reading");
  });
});

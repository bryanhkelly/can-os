import { describe, expect, it } from "vitest";
import { selectCourseClass } from "@/domain/course-class-registration";

describe("Course registration to Class selection",()=>{
  const A={id:"a",seatsRemaining:2},B={id:"b",seatsRemaining:1};
  it("automatically places when there is exactly one ready available Class",()=>{
    expect(selectCourseClass([A])).toBe("a");
    expect(selectCourseClass([{id:"self-paced",seatsRemaining:null}]))
      .toBe("self-paced");
    expect(selectCourseClass([{...A,seatsRemaining:0},B])).toBe("b");
  });
  it("requires explicit selection instead of arbitrarily choosing a schedule",()=>{
    expect(()=>selectCourseClass([A,B])).toThrow(/Choose a Class/);
    expect(selectCourseClass([A,B],"b")).toBe("b");
  });
  it("rejects absent and full Classes before registering a Course",()=>{
    expect(()=>selectCourseClass([])).toThrow(/No authorized ready Class/);
    expect(()=>selectCourseClass([A],"unknown")).toThrow(/not available/);
    expect(()=>selectCourseClass([{...A,seatsRemaining:0}],"a")).toThrow(/full/);
    expect(()=>selectCourseClass([{...A,seatsRemaining:0}])).toThrow(/full/);
  });
});

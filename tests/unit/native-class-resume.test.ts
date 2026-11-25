import {describe,expect,it} from "vitest";
import {deriveNativeClassResume,type ResumeLesson} from "@/domain/native-class-resume";
const lesson=(id:string,overrides:Partial<ResumeLesson>={}):ResumeLesson=>({
  lessonId:id,lessonTitle:"Lesson "+id,lessonBody:"Instruction",videoResources:[],progressStatus:null,...overrides,
});
describe("native Class resume",()=>{
  it("excludes empty content and counts completed and waived lessons",()=>{
    const result=deriveNativeClassResume("class","Course",[
      lesson("empty",{lessonBody:"  ",progressStatus:"completed"}),
      lesson("done",{progressStatus:"completed"}),
      lesson("waived",{progressStatus:"waived"}),
      lesson("video",{lessonBody:"",videoResources:[{}],progressStatus:"in_progress"}),
      lesson("later"),
    ]);
    expect(result).toEqual({classId:"class",title:"Course",lesson:{id:"video",title:"Lesson video"},completed:2,total:4});
  });
  it("returns no next lesson for completed or empty content",()=>{
    expect(deriveNativeClassResume("c","Course",[lesson("1",{progressStatus:"completed"})]))
      .toEqual({classId:"c",title:"Course",lesson:null,completed:1,total:1});
    expect(deriveNativeClassResume("c","Course",[]))
      .toEqual({classId:"c",title:"Course",lesson:null,completed:0,total:0});
  });
  it("projects no lesson bodies or video resources into the result",()=>{
    const result=deriveNativeClassResume("c","Course",[lesson("1",{lessonBody:"private body",videoResources:["private media"]})]);
    expect(JSON.stringify(result)).not.toContain("private");
    expect(result.lesson).toEqual({id:"1",title:"Lesson 1"});
  });
});

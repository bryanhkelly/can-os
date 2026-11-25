import { describe,expect,it } from "vitest";
import { canonicalLessonVideoResources } from "@/domain/canonical-lesson-video-resources";

describe("Canonical lesson video preservation",()=>{
  it("finds original YouTube links in Course resources before synthetic supplemental links",()=>{
    const result=canonicalLessonVideoResources({
      resources:[
        {url:"https://www.desmos.com/calculator",title:"Graphing tool"},
        {url:"https://www.youtube.com/watch?v=LDIiYKYvvdA",title:"Math Antics: Solving Two-Step Equations"},
      ],
      videoResources:[{
        url:"https://www.youtube.com/watch?v=sg0kQYvTlnc",title:"Additional practice",
        reviewStatus:"teacher_review_required",
      }],
    });
    expect(result).toEqual([
      {url:"https://www.youtube.com/watch?v=LDIiYKYvvdA",
       title:"Math Antics: Solving Two-Step Equations",
       reviewStatus:"original_resource_review_unverified"},
      {url:"https://www.youtube.com/watch?v=sg0kQYvTlnc",
       title:"Additional practice",reviewStatus:"teacher_review_required"},
    ]);
  });
  it("avoids duplicates and rejects unapproved protocols, unrelated tools and arbitrary URLs",()=>{
    const url="https://youtu.be/jsDxw63QqK0";
    expect(canonicalLessonVideoResources({
      resources:[{url,title:"Tour of the Cell"},{url:"javascript:alert(1)"},{url:"https://example.org/movie.mp4"}],
      videoResources:[{url,title:"duplicate"},{url:"https://vimeo.com/1234",title:"Vimeo practice"}],
    })).toEqual([
      {url,title:"Tour of the Cell",reviewStatus:"original_resource_review_unverified"},
      {url:"https://vimeo.com/1234",title:"Vimeo practice",reviewStatus:"unreviewed"},
    ]);
  });
  it("excludes supplemental review candidates from learner playback without changing stored resources",()=>{
    const content={
      resources:[{url:"https://youtu.be/LDIiYKYvvdA",title:"Equation balance"}],
      videoResources:[{url:"https://youtu.be/sg0kQYvTlnc",title:"Phishing",reviewStatus:"teacher_review_required"}],
    };
    expect(canonicalLessonVideoResources(content,{includeSupplementalCandidates:false})).toEqual([
      {url:"https://youtu.be/LDIiYKYvvdA",title:"Equation balance",reviewStatus:"original_resource_review_unverified"},
    ]);
    expect(canonicalLessonVideoResources(content)).toHaveLength(2);
  });
  it("handles missing or malformed resource arrays without errors",()=>{
    expect(canonicalLessonVideoResources({resources:null,videoResources:"invalid"})).toEqual([]);
  });
});

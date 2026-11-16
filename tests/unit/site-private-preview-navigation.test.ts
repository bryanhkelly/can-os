import {describe,expect,it} from "vitest";
import {linkPrivateSitePreviewPages} from "@/domain/site-private-preview-navigation";
const id="11111111-1111-4111-8111-111111111111";

describe("Authenticated Site-first multipage navigation",()=>{
  it("keeps published Site page navigation within an authorized private preview",()=>{
    const html='<nav><a href="/">Home</a><a href="/courses">Courses</a>'+
      '<a href="/classes">Classes</a><a href="/programs">Programs</a>'+
      '<a href="/admissions">Admissions</a></nav>';
    const output=linkPrivateSitePreviewPages(html,id);
    expect(output).toContain('/launch/site-preview?siteId='+id+'&amp;page=%2Fcourses');
    expect(output).toContain('/launch/site-preview?siteId='+id+'&amp;page=%2Fclasses');
    expect(output).toContain('/launch/site-preview?siteId='+id+'&amp;page=%2Fprograms');
    expect(output).toContain('/launch/site-preview?siteId='+id+'&amp;page=%2Fadmissions');
    expect(output).not.toContain('href="/courses"');
  });
  it("never rewrites existing approved registration actions, external links or forms",()=>{
    const html='<a href="https://app.example.org/learn/enroll?release=abc">Register</a>'+
      '<a href="/learn/classes?classId=abc">Class</a>'+
      '<a href="/launch/site">Admin</a>'+
      '<form action="/enroll"></form><a href="#faq">FAQ</a>';
    expect(linkPrivateSitePreviewPages(html,id)).toBe(html);
  });
  it("rejects invalid site IDs instead of producing a cross-Site preview link",()=>{
    expect(()=>linkPrivateSitePreviewPages('<a href="/courses">Courses</a>','../../admin')).toThrow();
  });
});

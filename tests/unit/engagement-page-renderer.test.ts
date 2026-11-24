import {describe,expect,it} from "vitest";
import { engagementDefinitionSchema, engagementRequiresClaimReview } from "@/domain/engagement-definition";
import { renderEngagementPage } from "@/domain/engagement-page-renderer";

const definition=engagementDefinitionSchema.parse({
  domain:"partnerships",
  subject:{kind:"partnership",id:null,label:"Community partner invitation"},
  audience:["partners","organizations"],
  interaction:"respond",
  expectedOutcome:"inquiry",
  presentation:{
    headline:"Welcome <script>alert(1)</script>",
    summary:"Explore a partnership with our community.",
    detail:"Let's talk & find a path together.",
  },
  execution:{
    mode:"page",template:"invitation",
    action:{kind:"information",journeyId:"church-networks"},
    actionLabel:"Learn more",
  },
});
describe("immutable public engagement page renderer",()=>{
  it("renders a controlled branded page without executing supplied HTML",()=>{
    const html=renderEngagementPage({
      mode:"page",definition,ownerName:"A & B Foundation",
      href:"/next/church-networks",
    });
    expect(html).toContain("Welcome &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("A &amp; B Foundation");
    expect(html).toContain('href="/next/church-networks"');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<form");
  });
  it("flags unverified institution-level claims for separate review",()=>{
    expect(engagementRequiresClaimReview(
      engagementDefinitionSchema.parse({
        ...definition,presentation:{
          headline:"Enrollment is now open",
          summary:"Explore a partnership with our community.",
        },
      }),
    )).toBe(true);
  });
});

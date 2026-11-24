import {describe,expect,it} from "vitest";
import { engagementDefinitionSchema, engagementRequiresClaimReview } from "@/domain/engagement-definition";
import { renderEngagementPage, renderUnavailableEngagementPage } from "@/domain/engagement-page-renderer";
import { resolveSiteTheme } from "@/domain/site-theme";

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
  it("uses canonical saved Site Brand palette and typography tokens",()=>{
    const theme=resolveSiteTheme("oxford","traditional");
    const html=renderEngagementPage({
      mode:"page",definition,ownerName:"The Oxford Community",
      href:"/next/church-networks",theme,
    });
    expect(html).toContain("color:"+theme.ink+";background:"+theme.canvas);
    expect(html).toContain("font-family:"+theme.displayFont);
    expect(html).not.toContain("<script");
  });
  it("uses the same square and keyboard-visible presentation for both public outcomes",()=>{
    const html=renderEngagementPage({mode:"page",definition,ownerName:"A & B Foundation",href:"/next/church-networks"});
    for(const output of [html,renderUnavailableEngagementPage(404),renderUnavailableEngagementPage(503)]){
      expect(output).toContain("border-radius:0");
      expect(output).toContain("min-height:44px");
      expect(output).toContain("overflow-wrap:anywhere");
      expect(output).toContain("a:focus-visible");
      expect(output).not.toContain("<script");
      expect(output).not.toContain("<form");
    }
    const unavailable=renderUnavailableEngagementPage(404);
    expect(unavailable).toContain('href="/landing"');
    expect(unavailable).not.toContain("A &amp; B Foundation");
    expect(unavailable).not.toContain("Enrollment now open");
    expect(renderUnavailableEngagementPage(503)).toContain("temporarily unavailable");
  });
  it("flags unverified institution-level claims for separate review",()=>{
    expect(engagementRequiresClaimReview(
      engagementDefinitionSchema.parse({
        ...definition,presentation:{
          headline:"Enrollment now open",
          summary:"Explore a partnership with our community.",
        },
      }),
    )).toBe(true);
  });
});

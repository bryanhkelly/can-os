import type { SiteTemplateId } from "./site-theme";

/** Five distinct, finite layout systems. All consume the same approved school content.
 * No dynamic HTML, CSS, remote fonts or untrusted source styles enter this catalog. */
export const siteTemplateCatalog: ReadonlyArray<{
  id: SiteTemplateId; name: string; description: string; character: string;
}> = [
  { id: "heritage", name: "Heritage Academy", description: "An editorial, academically grounded school website.", character: "Classical • Spacious • Established" },
  { id: "community", name: "Community & Faith", description: "A welcoming story-led experience with people and belonging first.", character: "Warm • Relational • Rooted" },
  { id: "modern", name: "Modern Academy", description: "An energetic, information-first campus experience.", character: "Bold • Precise • Contemporary" },
  { id: "bright-futures", name: "Bright Futures", description: "A clear, joyful introduction for families and younger learners.", character: "Optimistic • Open • Approachable" },
  { id: "summit", name: "Summit Preparatory", description: "An immersive, ambitious story of growth and discovery.", character: "Cinematic • Aspirational • Focused" },
];

/** Content is already HTML-escaped/rendered by public-site-html.ts. We control
 * structure only, and include each eligible section once regardless of style. */
export type PublicSiteHomeSections = {
  hero: string; vision: string; story: string; explore: string; academics: string;
  enrichment: string; closing: string; contact: string;
};

const homeOrders: Record<SiteTemplateId, readonly (keyof PublicSiteHomeSections)[]> = {
  heritage: ["hero", "vision", "story", "explore", "academics", "enrichment", "closing", "contact"],
  community: ["hero", "story", "enrichment", "vision", "explore", "academics", "contact", "closing"],
  modern: ["hero", "academics", "explore", "story", "enrichment", "vision", "closing", "contact"],
  "bright-futures": ["hero", "explore", "enrichment", "academics", "vision", "story", "contact", "closing"],
  summit: ["hero", "vision", "academics", "story", "enrichment", "explore", "closing", "contact"],
};
export function composePublicSiteHome(template: SiteTemplateId, sections: PublicSiteHomeSections): string {
  return homeOrders[template].map(key => sections[key]).join("");
}

/** Styles intentionally change composition, spacing, typographic treatment and
 * navigation/hero geometry; these are not five recolors of one layout.
 * Entirely static CSS is safe in both real public pages and sandboxed previews. */
export const publicSiteTemplateCss = `
/* Heritage: refined, academic and editorial — baseline renderer proportions. */
body.template-heritage .public-hero:not(.compact-hero){border-radius:0;min-height:clamp(520px,65vh,780px)}
body.template-heritage .public-hero:not(.compact-hero) h1{max-width:870px}
body.template-heritage .home-story{border-block:1px solid var(--site-ink)}
body.template-heritage .program-overview .card{border-top:3px solid var(--site-accent)}
/* Community: church and neighborhood narratives take the lead. */
body.template-community header{max-width:none;padding-left:max(24px,calc((100vw - 1170px)/2));padding-right:max(24px,calc((100vw - 1170px)/2));background:var(--site-paper)}
body.template-community main{max-width:1170px}
body.template-community .public-hero:not(.compact-hero){min-height:420px;padding:clamp(36px,6vw,85px);border-radius:0}
body.template-community .public-hero:not(.compact-hero) h1{font-size:clamp(3.5rem,7vw,6.2rem);max-width:720px}
body.template-community .home-story{background:var(--site-canvas,#fff);padding:clamp(32px,5vw,80px);border:0;gap:40px}
body.template-community .community-heading{grid-template-columns:1fr;text-align:center;border-top:1px solid var(--site-ink)}
body.template-community .community-heading h2{margin-inline:auto}
body.template-community .community-stories{grid-template-columns:repeat(2,minmax(0,1fr))}
body.template-community .closing-action{background:var(--site-secondary)}
/* Modern: strong geometry and information-first page rhythm. */
body.template-modern{--site-display:var(--site-body);letter-spacing:-.012em}
body.template-modern header{border-bottom:3px solid var(--site-ink)}
body.template-modern .brand{font:800 .86rem/1.3 var(--site-body);letter-spacing:.16em}
body.template-modern .public-hero:not(.compact-hero){min-height:490px;background:var(--site-ink);padding:clamp(28px,5vw,80px);border-radius:0}
body.template-modern .public-hero:not(.compact-hero) h1{font:800 clamp(3.8rem,8.5vw,7.8rem)/.98 var(--site-body);letter-spacing:-.075em;max-width:980px}
body.template-modern .public-hero.has-image::before{background:linear-gradient(90deg,rgba(9,20,30,.96),rgba(9,20,30,.62))}
body.template-modern .program-overview{border-top:5px solid var(--site-ink);padding-top:26px}
body.template-modern .program-overview .grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,290px),1fr));gap:0}
body.template-modern .program-overview .card{border:1px solid #d2d7da;box-shadow:none;border-radius:0}
body.template-modern .explore-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
body.template-modern .explore-link{background:var(--site-ink);color:white;border:1px solid var(--site-paper)}
body.template-modern .explore-link .explore-copy>span,body.template-modern .explore-number{color:#f2f3f4}
body.template-modern .closing-action{border-radius:0}
/* Bright Futures: a light, family-friendly approach, information in broad bands. */
body.template-bright-futures{background:var(--site-paper)}
body.template-bright-futures header{border-bottom:0}
body.template-bright-futures .public-hero:not(.compact-hero){min-height:450px;border-radius:0;padding:clamp(32px,6vw,90px)}
body.template-bright-futures .public-hero:not(.compact-hero) h1{font-size:clamp(3.5rem,7.6vw,7rem);max-width:800px;letter-spacing:-.045em}
body.template-bright-futures .explore-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
body.template-bright-futures .explore-link{min-height:150px;background:#fff;border:1px solid #d2d7da;padding:clamp(22px,3vw,42px)}
body.template-bright-futures .explore-number{font-size:1.45rem;color:var(--site-secondary)}
body.template-bright-futures .explore-link strong{font-size:clamp(1.4rem,2.4vw,2.3rem)}
body.template-bright-futures .home-story{background:#fff;padding:clamp(28px,4vw,66px);border:0}
body.template-bright-futures .closing-action{border-radius:0;background:var(--site-secondary)}
/* Summit: immersive full-bleed photographic stage with centered opening. */
body.template-summit header{max-width:none;padding-inline:clamp(20px,5vw,86px);border-bottom:0}
body.template-summit main{max-width:1350px}
body.template-summit .public-hero:not(.compact-hero){min-height:clamp(570px,78vh,900px);margin-inline:calc(-1 * clamp(20px,4vw,52px));border-radius:0;align-items:center;text-align:center}
body.template-summit .public-hero:not(.compact-hero) h1{font-size:clamp(4rem,8vw,8.5rem);max-width:1020px}
body.template-summit .public-hero .intro,body.template-summit .public-hero .hero-subtitle{max-width:770px}
body.template-summit .public-hero .hero-actions{justify-content:center}
body.template-summit .public-hero.has-image::before{background:linear-gradient(180deg,rgba(10,26,40,.54),rgba(10,26,40,.8))}
body.template-summit .vision-feature{background:var(--site-ink);padding:clamp(38px,7vw,110px);border-radius:0}
body.template-summit .vision-feature h2{font-size:clamp(3rem,5vw,5.5rem)}
body.template-summit .closing-action{border-radius:0;text-align:center}
body.template-summit .closing-action h2{margin-inline:auto}
@media(max-width:800px){
  body.template-modern .explore-grid{grid-template-columns:1fr}
  body.template-community .community-stories{grid-template-columns:1fr}
  body.template-bright-futures .explore-grid{grid-template-columns:1fr}
  body.template-summit .public-hero:not(.compact-hero){margin-inline:0;min-height:480px}
  body.template-summit .public-hero:not(.compact-hero) h1{font-size:clamp(3rem,11vw,5rem)}
}
`;

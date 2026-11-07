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

/** Each design has a distinct content rhythm while preserving all approved facts. */
export function composePublicSiteHome(template: SiteTemplateId, sections: PublicSiteHomeSections): string {
  const join = (keys: readonly (keyof PublicSiteHomeSections)[]) =>
    keys.map(key => sections[key]).join("");
  switch(template) {
    case "heritage": return sections.hero +
      '<div class="home-composition home-heritage"><div class="heritage-editorial-pair">' +
      join(["vision","story"]) + '</div>' +
      join(["explore","academics","enrichment","closing","contact"]) + '</div>';
    case "community": return sections.hero +
      '<div class="home-composition home-community"><div class="community-people-first">' +
      join(["story","enrichment"]) + '</div>' +
      join(["vision","explore","academics","contact","closing"]) + '</div>';
    case "modern": return sections.hero +
      '<div class="home-composition home-modern"><div class="modern-information-first">' +
      join(["academics","explore"]) + '</div>' +
      join(["story","enrichment","vision","closing","contact"]) + '</div>';
    case "bright-futures": return sections.hero +
      '<div class="home-composition home-bright"><div class="bright-family-first">' +
      join(["explore","enrichment"]) + '</div>' +
      join(["academics","vision","story","contact","closing"]) + '</div>';
    case "summit": return sections.hero +
      '<div class="home-composition home-summit"><div class="summit-manifesto">' +
      sections.vision + '</div>' +
      join(["academics","story","enrichment","explore","closing","contact"]) + '</div>';
  }
}

/** Styles intentionally change composition, spacing, typographic treatment and
 * navigation/hero geometry; these are not five recolors of one layout.
 * Entirely static CSS is safe in both real public pages and sandboxed previews. */
export const publicSiteTemplateCss = `
.interior-community{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:40px;align-items:start}
.interior-modern .interior-main{border-top:6px solid var(--site-accent);padding-top:24px}
.interior-modern .compact-hero{max-width:850px;margin-inline:0}
.interior-bright .interior-main{background:var(--site-paper);padding:32px;border-radius:32px}
.interior-bright .interior-related{margin:36px 0;border-top:8px solid var(--site-accent)}
.interior-summit{max-width:960px;margin:48px auto}.interior-summit .interior-related{border-block:1px solid var(--site-ink);padding-block:32px}
.interior-heritage{max-width:1080px;margin:40px auto}.interior-heritage .interior-related{border-top:1px solid var(--site-ink);padding-top:28px}
@media(max-width:760px){.interior-community{grid-template-columns:1fr}.interior-bright .interior-main{padding:20px}.interior-summit{margin-block:24px}}

/* When schools choose an editorial H1, the welcome sentence is supporting
 * copy rather than a competing second headline. Legacy headlines are unchanged. */
.public-hero.editorial-headline .hero-subtitle{font-family:var(--site-body);font-size:clamp(1rem,1.6vw,1.35rem);line-height:1.65;font-weight:400;letter-spacing:0;max-width:740px}
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
body.template-community .home-story{background:var(--site-paper);padding:clamp(32px,5vw,80px);border:0;gap:40px}
body.template-community .community-heading{grid-template-columns:1fr;text-align:center;border-top:1px solid var(--site-ink)}
body.template-community .community-heading h2{margin-inline:auto}
body.template-community .community-stories{grid-template-columns:repeat(2,minmax(0,1fr))}
body.template-community .closing-action{background:var(--site-secondary)}
/* Modern: strong geometry and information-first page rhythm. */
body.template-modern{letter-spacing:-.012em}
body.template-modern header{border-bottom:3px solid var(--site-ink)}
body.template-modern .brand{font:800 .86rem/1.3 var(--site-display);letter-spacing:.16em}
body.template-modern .public-hero:not(.compact-hero){min-height:490px;background:var(--site-ink);padding:clamp(28px,5vw,80px);border-radius:0}
body.template-modern .public-hero:not(.compact-hero) h1{font:800 clamp(3.8rem,8.5vw,7.8rem)/.98 var(--site-display);letter-spacing:-.075em;max-width:980px}
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

/* Five school design systems: distinct mastheads, hero geometry and page rhythms.
 * Approved Site content and renderer security are shared; no invented photos. */
body.template-heritage header{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:14px 24px;padding-top:22px;padding-bottom:18px}
body.template-heritage header .brand{grid-column:1/-1}
body.template-heritage header .desktop-nav{grid-column:1;grid-row:2}
body.template-heritage header .site-nav-cta{grid-column:2;grid-row:2}
body.template-heritage header .brand{width:100%;text-align:center;border-bottom:1px solid var(--site-ink);padding-bottom:20px;font:500 clamp(1.2rem,2.4vw,2rem)/1.3 var(--site-display);letter-spacing:.13em}
body.template-heritage header .desktop-nav{flex:1;justify-content:center}
body.template-heritage .public-hero:not(.compact-hero){display:flex;align-items:flex-start;min-height:560px;background:var(--site-paper);color:var(--site-ink);border-block:1px solid var(--site-ink)}
body.template-heritage .public-hero:not(.compact-hero) h1{max-width:54%;color:var(--site-ink);font-size:clamp(3.4rem,6vw,6.2rem)}
body.template-heritage .public-hero:not(.compact-hero)>p,body.template-heritage .public-hero:not(.compact-hero) .hero-actions{max-width:54%}
body.template-heritage .public-hero:not(.compact-hero) .hero-subtitle{color:var(--site-secondary)}
body.template-heritage .public-hero:not(.compact-hero) .intro{color:var(--site-muted)}
body.template-heritage .public-hero:not(.compact-hero) .tag{color:var(--site-secondary)}
body.template-heritage .public-hero:not(.compact-hero) .hero-button{background:var(--site-ink);color:#fff}
body.template-heritage .public-hero:not(.compact-hero) .hero-text-link{color:var(--site-ink)}
body.template-heritage .public-hero:not(.compact-hero) .hero-background-image{left:auto;right:0;width:44%;z-index:1}
body.template-heritage .public-hero:not(.compact-hero).has-image::before{display:none}
body.template-heritage .heritage-editorial-pair{border-block:1px solid var(--site-ink);margin-top:58px}

body.template-community header{gap:28px;border-top:7px solid var(--site-accent);background:var(--site-paper)}
body.template-community header .brand{font:500 1.3rem/1.4 var(--site-display);letter-spacing:0;text-transform:none}
body.template-community .public-hero:not(.compact-hero){min-height:540px;background:var(--site-secondary);padding-left:50%;padding-right:clamp(28px,5vw,76px);display:flex;flex-direction:column;align-items:flex-start;justify-content:center}
body.template-community .public-hero:not(.compact-hero) h1{font-size:clamp(3.25rem,5.8vw,6rem)}
body.template-community .public-hero:not(.compact-hero) .hero-background-image{left:0;right:auto;width:46%;z-index:1}
body.template-community .public-hero:not(.compact-hero).has-image::before{display:none}
body.template-community .community-people-first{background:var(--site-paper);padding:clamp(24px,4vw,52px);margin-top:55px}
body.template-community .community-people-first .home-story{border:0;padding:clamp(20px,3vw,40px) 0}
body.template-community .community-people-first .editorial-section+.editorial-section{margin-top:40px}

body.template-modern header{max-width:none;background:var(--site-ink);color:#fff;padding-inline:max(24px,calc((100vw - 1240px)/2));border-bottom:5px solid var(--site-accent)}
body.template-modern header .brand,body.template-modern header nav a{color:#fff}
body.template-modern header .site-nav-cta{background:var(--site-accent);color:var(--site-ink);border-radius:0}
body.template-modern .public-hero:not(.compact-hero){min-height:570px;background:var(--site-ink);padding-right:37%;border-left:12px solid var(--site-accent)}
body.template-modern .public-hero:not(.compact-hero) h1{font-size:clamp(3.5rem,7.3vw,7rem);line-height:.93;letter-spacing:-.075em}
body.template-modern .public-hero:not(.compact-hero) .hero-background-image{left:auto;right:0;width:33%;z-index:1}
body.template-modern .public-hero:not(.compact-hero).has-image::before{display:none}
body.template-modern .public-hero:not(.compact-hero) .hero-button{border-radius:0}
body.template-modern .modern-information-first{border-top:7px solid var(--site-accent);padding-top:32px;margin-top:52px}
body.template-modern .modern-information-first .editorial-section+.editorial-section{margin-top:46px}

body.template-bright-futures header{background:var(--site-paper);border-bottom:0}
body.template-bright-futures header .brand{font:500 1.35rem/1.4 var(--site-display);letter-spacing:0;text-transform:none}
body.template-bright-futures header .desktop-nav{background:#fff;padding:10px 16px;border-radius:999px}
body.template-bright-futures header .site-nav-cta{border-radius:999px;background:var(--site-secondary)}
body.template-bright-futures .public-hero:not(.compact-hero){min-height:560px;background:var(--site-paper);color:var(--site-ink);padding-right:47%}
body.template-bright-futures .public-hero:not(.compact-hero) h1{color:var(--site-ink);font-size:clamp(3.4rem,6.3vw,6.7rem)}
body.template-bright-futures .public-hero:not(.compact-hero) .hero-subtitle{color:var(--site-secondary)}
body.template-bright-futures .public-hero:not(.compact-hero) .tag{color:var(--site-secondary)}
body.template-bright-futures .public-hero:not(.compact-hero) .intro{color:var(--site-muted)}
body.template-bright-futures .public-hero:not(.compact-hero) .hero-text-link{color:var(--site-ink)}
body.template-bright-futures .public-hero:not(.compact-hero) .hero-button{background:var(--site-secondary);color:#fff;border-radius:999px}
body.template-bright-futures .public-hero:not(.compact-hero) .hero-background-image{inset:7% 4% 7% auto;width:38%;height:86%;border-radius:48% 48% 12% 12%;z-index:1}
body.template-bright-futures .public-hero:not(.compact-hero).has-image::before{display:none}
body.template-bright-futures .bright-family-first{background:#fff;border-radius:32px;padding:clamp(24px,4vw,54px);margin-top:52px}
body.template-bright-futures .bright-family-first .editorial-section+.editorial-section{margin-top:40px}

body.template-summit header{max-width:none;padding-inline:clamp(24px,6vw,100px);border-bottom:0}
body.template-summit header .brand{font:500 1.35rem/1.4 var(--site-display);letter-spacing:.12em}
body.template-summit header .site-nav-cta{border:1px solid var(--site-ink);background:transparent;color:var(--site-ink);border-radius:0}
body.template-summit .public-hero:not(.compact-hero){min-height:clamp(630px,84vh,940px);margin-inline:calc(-1 * clamp(20px,4vw,52px));align-items:center;text-align:center;padding:clamp(48px,8vw,110px)}
body.template-summit .public-hero:not(.compact-hero) h1{font-size:clamp(4rem,8vw,8.7rem);max-width:1050px}
body.template-summit .public-hero:not(.compact-hero) .hero-actions{justify-content:center}
body.template-summit .public-hero:not(.compact-hero).has-image::before{background:linear-gradient(180deg,rgba(10,24,35,.44),rgba(10,24,35,.84))}
body.template-summit .summit-manifesto{margin-top:65px}
body.template-summit .summit-manifesto .vision-feature{min-height:400px;border-radius:0}

.home-composition>section+section,.home-composition>div+section,.home-composition>section+div,.home-composition>div+div{margin-top:clamp(54px,7vw,102px)}
@media(max-width:800px){
 body.template-heritage header{flex-direction:row;align-items:center;justify-content:space-between}
 body.template-heritage header .brand{border:0;padding:0;text-align:left;width:auto}
 body.template-modern header .mobile-menu summary{border-color:#fff;color:#fff}
}
@media(max-width:700px){
 body.template-heritage .public-hero:not(.compact-hero),
 body.template-community .public-hero:not(.compact-hero),
 body.template-modern .public-hero:not(.compact-hero),
 body.template-bright-futures .public-hero:not(.compact-hero){min-height:0;padding:34px 26px 320px;align-items:flex-start;text-align:left}
 body.template-heritage .public-hero:not(.compact-hero) h1,
 body.template-heritage .public-hero:not(.compact-hero)>p,
 body.template-heritage .public-hero:not(.compact-hero) .hero-actions{max-width:100%}
 body.template-heritage .public-hero:not(.compact-hero) .hero-background-image,
 body.template-community .public-hero:not(.compact-hero) .hero-background-image,
 body.template-modern .public-hero:not(.compact-hero) .hero-background-image,
 body.template-bright-futures .public-hero:not(.compact-hero) .hero-background-image{
   top:auto;bottom:0;left:0;right:0;width:100%;height:288px;border-radius:0
 }
 body.template-heritage .public-hero:not(.compact-hero) h1,
 body.template-community .public-hero:not(.compact-hero) h1,
 body.template-modern .public-hero:not(.compact-hero) h1,
 body.template-bright-futures .public-hero:not(.compact-hero) h1{font-size:clamp(2.7rem,11vw,4.5rem)}
 body.template-summit .public-hero:not(.compact-hero){margin-inline:0;min-height:520px}
 .community-people-first,.bright-family-first{padding:22px}
}

/* Photo-free school sites use intentional graphic artwork, never synthetic people. */
body.template-heritage .public-hero:not(.compact-hero):not(.has-image)::before,
body.template-community .public-hero:not(.compact-hero):not(.has-image)::before,
body.template-modern .public-hero:not(.compact-hero):not(.has-image)::before,
body.template-bright-futures .public-hero:not(.compact-hero):not(.has-image)::before{
  content:"";position:absolute;top:0;bottom:0;display:block;pointer-events:none;z-index:0
}
body.template-heritage .public-hero:not(.compact-hero):not(.has-image)::before{
  left:auto;right:0;width:44%;background:repeating-linear-gradient(145deg,transparent 0 44px,rgba(255,255,255,.15) 45px 47px,transparent 48px 90px),linear-gradient(135deg,var(--site-secondary),var(--site-ink))
}
body.template-community .public-hero:not(.compact-hero):not(.has-image)::before{
  left:0;width:46%;background:radial-gradient(circle at 42% 38%,var(--site-accent) 0 13%,transparent 13.5%),linear-gradient(140deg,var(--site-ink),var(--site-secondary))
}
body.template-modern .public-hero:not(.compact-hero):not(.has-image)::before{
  left:auto;right:0;width:33%;background:linear-gradient(155deg,var(--site-accent) 0 25%,var(--site-secondary) 25% 57%,var(--site-ink) 57%)
}
body.template-bright-futures .public-hero:not(.compact-hero):not(.has-image)::before{
  top:7%;bottom:7%;left:auto;right:4%;width:38%;border-radius:48% 48% 12% 12%;
  background:radial-gradient(circle at 54% 35%,var(--site-accent) 0 20%,transparent 21%),linear-gradient(130deg,var(--site-secondary),var(--site-ink))
}
body.template-heritage .public-hero:not(.compact-hero)>h1,
body.template-heritage .public-hero:not(.compact-hero)>p,
body.template-heritage .public-hero:not(.compact-hero)>.hero-actions,
body.template-community .public-hero:not(.compact-hero)>h1,
body.template-community .public-hero:not(.compact-hero)>p,
body.template-community .public-hero:not(.compact-hero)>.hero-actions,
body.template-modern .public-hero:not(.compact-hero)>h1,
body.template-modern .public-hero:not(.compact-hero)>p,
body.template-modern .public-hero:not(.compact-hero)>.hero-actions,
body.template-bright-futures .public-hero:not(.compact-hero)>h1,
body.template-bright-futures .public-hero:not(.compact-hero)>p,
body.template-bright-futures .public-hero:not(.compact-hero)>.hero-actions{position:relative;z-index:2}
@media(max-width:800px){
  body.template-heritage header .brand{grid-column:1;grid-row:1}
  body.template-heritage header .mobile-menu{grid-column:2;grid-row:1}
}
@media(max-width:700px){
  body.template-heritage .public-hero:not(.compact-hero):not(.has-image)::before,
  body.template-community .public-hero:not(.compact-hero):not(.has-image)::before,
  body.template-modern .public-hero:not(.compact-hero):not(.has-image)::before,
  body.template-bright-futures .public-hero:not(.compact-hero):not(.has-image)::before{
    top:auto;bottom:0;left:0;right:0;width:100%;height:288px;border-radius:0
  }
}
`;

/** Interior compositions consume the same approved fragments; no template invents facts. */
export function composePublicSiteInterior(template: SiteTemplateId, hero: string, primary: string, secondary = ""): string {
  switch (template) {
    case "community": return hero + `<div class="interior-community"><div class="interior-story">${primary}</div><aside class="interior-related">${secondary}</aside></div>`;
    case "modern": return `<div class="interior-modern">${hero}<div class="interior-main">${primary}</div><div class="interior-related">${secondary}</div></div>`;
    case "bright-futures": return hero + `<div class="interior-bright"><div class="interior-main">${primary}</div><div class="interior-related">${secondary}</div></div>`;
    case "summit": return hero + `<div class="interior-summit"><div class="interior-main">${primary}</div><div class="interior-related">${secondary}</div></div>`;
    default: return hero + `<article class="interior-heritage">${primary}<div class="interior-related">${secondary}</div></article>`;
  }
}

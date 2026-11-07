import type { SiteTemplateId } from "./site-theme";

/** Seven distinct, finite layout systems. All consume the same approved school content.
 * No dynamic HTML, CSS, remote fonts or untrusted source styles enter this catalog. */
export const siteTemplateCatalog: ReadonlyArray<{
  id: SiteTemplateId; name: string; description: string; character: string;
}> = [
  { id: "heritage", name: "Heritage Academy", description: "An editorial, academically grounded school website.", character: "Classical • Spacious • Established" },
  { id: "community", name: "Community & Faith", description: "A welcoming story-led experience with people and belonging first.", character: "Warm • Relational • Rooted" },
  { id: "modern", name: "Modern Learning", description: "An energetic, information-first campus experience.", character: "Bold • Precise • Contemporary" },
  { id: "bright-futures", name: "Bright Futures", description: "A clear, joyful introduction for families and younger learners.", character: "Optimistic • Open • Approachable" },
  { id: "summit", name: "Summit Preparatory", description: "An immersive, ambitious story of growth and discovery.", character: "Cinematic • Aspirational • Focused" },
  { id: "classic", name: "Heritage Classical", description: "An enduring school prospectus with an institutional crest, pillars and traditional campus composition.", character: "Traditional • Collegiate • Refined" },
  { id: "campus", name: "Campus Life", description: "A photographic school journal built around editorial stories and a campus mosaic.", character: "Photographic • Energetic • Human" },
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
    case "classic": return sections.hero +
      '<div class="home-composition home-classic"><div class="classic-pillars">' +
      join(["academics","vision","enrichment"]) + '</div>' +
      join(["story","explore","closing","contact"]) + '</div>';
    case "campus": return sections.hero +
      '<div class="home-composition home-campus"><div class="campus-stories">' +
      join(["story","enrichment","explore"]) + '</div>' +
      join(["vision","academics","closing","contact"]) + '</div>';
  }
}


/**
 * Seven independently composed public school shells.
 * All values are escaped or fixed HTML produced by the canonical public renderer.
 * No Site-entered HTML, scripts, extra routes or private records are accepted here.
 */
export type PublicSiteChrome = {
  brand: string;
  /** Pre-escaped Site-specific monogram derived from the canonical school name. */
  monogram: string;
  navigation: string;
  cta: string;
  mobile: string;
  main: string;
  footer: string;
};
export function composePublicSiteChrome(template: SiteTemplateId, p: PublicSiteChrome): string {
  const nav = '<nav class="desktop-nav" aria-label="School website navigation">' + p.navigation + '</nav>';
  const brand = '<p class="brand">' + p.brand + '</p>';
  switch (template) {
    case "heritage": return '<div class="school-shell shell-heritage">' +
      '<header class="school-masthead header-heritage"><span class="edition">A SCHOOL WITH A STORY TO TELL</span>' +
      '<div class="school-lockup"><span class="school-crest" aria-hidden="true">' + p.monogram + '</span>' + brand + '</div>' +
      '<div class="masthead-navigation">' + nav + p.cta + p.mobile + '</div></header>' +
      p.main + p.footer + '</div>';
    case "community": return '<div class="school-shell shell-community">' +
      '<div class="community-announcement">WELCOME TO OUR LEARNING COMMUNITY</div>' +
      '<header class="school-masthead header-community"><div class="community-logo">' +
      '<span class="community-emblem" aria-hidden="true">' + p.monogram + '</span>' + brand + '</div>' +
      nav + p.cta + p.mobile + '</header>' + p.main + p.footer + '</div>';
    case "modern": return '<div class="school-shell shell-modern">' +
      '<header class="school-masthead header-modern"><div class="modern-logo">' +
      '<span class="modern-logo-mark" aria-hidden="true">' + p.monogram + '</span>' + brand + '</div>' +
      '<p class="rail-label">EXPLORE YOUR SCHOOL</p>' + nav +
      '<div class="modern-rail-action">' + p.cta + '</div>' + p.mobile + '</header>' +
      p.main + p.footer + '</div>';
    case "bright-futures": return '<div class="school-shell shell-bright">' +
      '<header class="school-masthead header-bright"><div class="bright-lockup">' +
      '<span class="bright-sun" aria-hidden="true">' + p.monogram + '</span>' + brand + '</div>' +
      nav + p.cta + p.mobile + '</header>' + p.main + p.footer + '</div>';
    case "summit": return '<div class="school-shell shell-summit">' +
      '<div class="summit-spine" aria-hidden="true"><span>△</span><span>SUMMIT · GROWTH · DISCOVERY</span><span>↓</span></div>' +
      '<header class="school-masthead header-summit"><div class="summit-lockup">' +
      '<span class="summit-logo-mark" aria-hidden="true">' + p.monogram + '</span>' + brand + '</div>' + nav + p.cta + p.mobile + '</header>' +
      p.main + p.footer + '</div>';
    case "classic": return '<div class="school-shell shell-classic">' +
      '<div class="classic-utility">FAITH&nbsp;&nbsp;·&nbsp;&nbsp;SCHOLARSHIP&nbsp;&nbsp;·&nbsp;&nbsp;CHARACTER</div>' +
      '<header class="school-masthead header-classic"><div class="classic-lockup">' +
      '<span class="classic-crest" aria-hidden="true">' + p.monogram + '</span>' + brand + '</div>' +
      nav + p.cta + p.mobile + '</header>' + p.main + p.footer + '</div>';
    case "campus": return '<div class="school-shell shell-campus">' +
      '<header class="school-masthead header-campus"><div class="campus-lockup">' +
      '<span class="campus-logo-mark" aria-hidden="true">' + p.monogram + '</span>' + brand + '<small>THE SCHOOL JOURNAL</small></div>' +
      nav + p.cta + p.mobile + '</header>' + p.main + p.footer + '</div>';
  }
}

export type PublicSiteHeroParts = {
  kicker: string;
  title: string;
  subtitle: string;
  intro: string;
  actions: string;
  image: string;
  /** Additional rights-reviewed, escaped public image tags; Campus journal only. */
  mosaicImages?: readonly string[];
};
/** Hero structures match the seven independent editorial architectures. */
export function composePublicSiteHero(template: SiteTemplateId, p: PublicSiteHeroParts): string {
  const photo = '<div class="seven-photo">' +
    (p.image || '<span class="seven-illustration" aria-hidden="true"></span>') + '</div>';
  const copy = '<p class="tag">' + p.kicker + '</p><h1>' + p.title + '</h1>' +
    p.subtitle + '<p class="intro">' + p.intro + '</p>' +
    '<div class="hero-actions">' + p.actions + '</div>';
  const cls = 'public-hero home-hero seven-hero-' + template + (p.image ? ' has-image' : '');
  switch(template) {
    case "heritage": return '<section id="welcome" class="' + cls + '">' +
      '<div class="heritage-folio"><span>VOLUME 01 · DISCOVER OUR SCHOOL</span><i></i><span>01 / 07</span></div>' +
      '<div class="seven-hero-copy">' + copy + '</div>' + photo +
      '<span class="heritage-photo-label">ROOTED IN PURPOSE · READY FOR POSSIBILITY</span></section>';
    case "community": return '<section id="welcome" class="' + cls + '">' +
      '<div class="community-stamp" aria-hidden="true">OPEN<br>HEARTS<br>OPEN DOORS</div>' +
      '<div class="seven-hero-copy">' + copy + '</div>' +
      '<div class="community-polaroids"><div class="community-photo-note">' + photo + '</div>' +
      '<div class="community-photo-card" aria-hidden="true">A PLACE<br>TO BELONG</div></div></section>';
    case "modern": return '<section id="welcome" class="' + cls + '">' +
      '<div class="modern-hero-panel"><span class="modern-panel-label">01 / A SCHOOL BUILT FOR WHAT IS NEXT</span>' +
      '<div class="seven-hero-copy">' + copy + '</div></div>' +
      '<div class="modern-hero-photo">' + photo + '</div>' +
      '<div class="modern-hero-tile"><span>02 / DISCOVER</span><strong>Find your pathway.</strong>' +
      '<span>Explore published learning opportunities.</span></div>' +
      '<div class="modern-hero-tile modern-tile-alt"><span>03 / COMMUNITY</span><strong>Make room to grow.</strong></div></section>';
    case "bright-futures": return '<section id="welcome" class="' + cls + '">' +
      '<span class="bright-spark" aria-hidden="true">✳</span>' +
      '<div class="seven-hero-copy">' + copy + '</div>' +
      '<div class="bright-portrait">' + photo +
      '<span class="bright-sticker" aria-hidden="true">BE<br>YOU!</span></div></section>';
    case "summit": return '<section id="welcome" class="' + cls + '">' + photo +
      '<div class="summit-cover-overlay"></div>' +
      '<div class="seven-hero-copy"><span class="summit-index">01 — DISCOVER</span>' +
      copy + '</div><span class="summit-coordinates">A SCHOOL OF PURPOSE · COURAGE · LEARNING</span></section>';
    case "classic": return '<section id="welcome" class="' + cls + '">' +
      '<div class="seven-hero-copy"><div class="classic-emblem" aria-hidden="true">✦</div>' +
      copy + '</div>' + photo + '</section>';
    case "campus": return '<section id="welcome" class="' + cls + '">' +
      '<div class="campus-intro"><div class="seven-hero-copy">' + copy + '</div>' +
      '<p class="campus-side-note">The people. The learning. The moments that make a school.</p></div>' +
      '<div class="campus-mosaic"><div class="campus-mosaic-main">' + photo +
      '<span class="mosaic-caption">01 / OUR SCHOOL</span></div>' +
      '<div class="campus-mosaic-tile mosaic-second">' + (p.mosaicImages?.[0] || '') +
      '<span>02 / LEARNING</span><b>Where curiosity leads.</b></div>' +
      '<div class="campus-mosaic-tile mosaic-third">' + (p.mosaicImages?.[1] || '') +
      '<span>03 / COMMUNITY</span><b>Belonging looks like this.</b></div>' +
      '<div class="campus-mosaic-tile mosaic-fourth">' + (p.mosaicImages?.[2] || '') +
      '<span>04 / DISCOVERY</span><b>Find your next chapter.</b></div></div></section>';
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

export const sevenSchoolCss = `

/* School Website Builder: seven externally facing visual architectures.
   No dashboard styles, runtime CSS, third-party fonts or scripts. */
.school-shell{min-width:0;overflow-x:clip}
.school-shell a{color:inherit}
.school-shell .school-masthead{box-sizing:border-box;max-width:none;margin:0;padding:20px clamp(20px,4.5vw,76px);display:flex;align-items:center;justify-content:space-between;flex-wrap:nowrap;gap:24px}
.school-shell .school-masthead .brand{margin:0;font-size:1.08rem;line-height:1.3;overflow-wrap:anywhere}
.school-shell .school-masthead .desktop-nav{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:clamp(9px,1.3vw,22px)}
.school-shell .school-masthead .desktop-nav a{font-size:.78rem;font-weight:750;line-height:1.2;text-decoration:none;white-space:nowrap}
.school-shell .school-masthead .desktop-nav a[aria-current=page]{text-decoration:underline;text-underline-offset:7px}
.school-shell .school-masthead .desktop-more{position:relative;font-size:.78rem;font-weight:750}
.school-shell .school-masthead .desktop-more summary{display:flex;align-items:center;min-height:44px;cursor:pointer;list-style:none;white-space:nowrap}
.school-shell .school-masthead .desktop-more summary::-webkit-details-marker{display:none}
.school-shell .school-masthead .desktop-more summary::after{content:"⌄";font-size:1.15rem;margin-left:5px}
.school-shell .school-masthead .more-links{position:absolute;z-index:30;top:44px;right:0;width:235px;display:grid;gap:2px;padding:10px;background:var(--site-paper);color:var(--site-ink);border:1px solid #bbc6c7;box-shadow:0 16px 35px #0003}
.school-shell .school-masthead .more-links a{display:block;min-height:39px;padding:10px;white-space:normal;font-size:.84rem}
.school-shell .school-masthead .more-links a:hover{background:#e7e7df}

.school-shell .school-masthead .site-nav-cta{flex-shrink:0}
.school-shell>footer{max-width:none;padding:28px clamp(24px,5vw,80px);margin:0}
.school-shell .public-hero.home-hero{border-radius:0;overflow:hidden;isolation:isolate;position:relative;margin-bottom:0;padding:0}
.school-shell .public-hero.home-hero:before,.school-shell .public-hero.home-hero:after{display:none!important}
.school-shell .public-hero.home-hero .seven-hero-copy{position:relative;z-index:2;min-width:0}
.school-shell .public-hero.home-hero .seven-hero-copy h1{overflow-wrap:break-word;hyphens:auto}
.school-shell .public-hero.home-hero .intro{font-size:clamp(.95rem,1.3vw,1.17rem);line-height:1.65;max-width:660px}
.school-shell .seven-photo{position:relative;isolation:isolate;overflow:hidden;min-width:0;min-height:260px;background:var(--site-secondary)}
.school-shell .seven-photo .hero-background-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0}
.school-shell .seven-illustration{display:block;position:absolute;inset:0;background:radial-gradient(circle at 23% 30%,var(--site-accent) 0 16%,transparent 17%),linear-gradient(145deg,var(--site-secondary),var(--site-ink))}
.school-shell .seven-illustration::before{content:"";position:absolute;left:16%;right:20%;top:20%;bottom:14%;border:2px solid #ffffff60;border-radius:50%}
.school-shell .public-hero.home-hero .hero-button{font-size:.85rem;letter-spacing:.03em}
.school-shell .public-hero.home-hero .hero-actions{margin-top:26px}
.school-shell .public-hero.home-hero .hero-subtitle{max-width:680px}
.school-shell main#main-content{max-width:1320px;margin:0 auto}
.school-shell main#main-content>.public-hero.home-hero{margin-left:calc(-1 * clamp(20px,4vw,52px));margin-right:calc(-1 * clamp(20px,4vw,52px))}
.school-shell .home-composition{min-width:0;padding-top:clamp(38px,5vw,84px)}
.school-shell .home-composition .card,.school-shell .home-composition .explore-link{min-width:0}
.school-shell .interior-classic,.school-shell .interior-campus{max-width:1160px;margin:44px auto;min-width:0}
.school-shell .interior-classic .interior-main{border-top:2px solid var(--site-ink);padding-top:26px}
.school-shell .interior-classic .interior-related{border-top:1px solid var(--site-accent);margin-top:36px;padding-top:26px}
.school-shell .interior-campus .interior-main{border-top:9px solid var(--site-ink);padding-top:28px}
.school-shell .interior-campus .interior-related{background:var(--site-paper);padding:25px;margin-top:40px}

/* Heritage — prospectus masthead, folio rail and a photographic editorial cover. */
body.template-heritage .school-masthead.header-heritage{display:grid;grid-template-columns:minmax(0,.75fr) minmax(0,1fr) minmax(0,2fr);min-height:110px;background:#f3eee4;border-bottom:1px solid #c1b39f;color:#14283e;gap:22px}
body.template-heritage .header-heritage .edition{font-size:.62rem;letter-spacing:.2em;font-weight:800;color:#896b37}
body.template-heritage .header-heritage .school-lockup{display:flex;align-items:center;gap:13px;min-width:0}
body.template-heritage .header-heritage .school-crest{display:grid;place-items:center;flex-shrink:0;background:#14283e;color:#e7bf7b;width:46px;height:54px;clip-path:polygon(5% 0,95% 0,95% 73%,50% 100%,5% 73%);font:2rem Georgia,serif}
body.template-heritage .header-heritage .brand{font:700 clamp(1rem,1.4vw,1.3rem)/1.14 var(--site-display);letter-spacing:.04em;text-align:left;width:auto;padding:0;border:0}
body.template-heritage .header-heritage .masthead-navigation{display:flex;align-items:center;justify-content:flex-end;gap:20px;min-width:0}
body.template-heritage .header-heritage .desktop-nav{gap:13px;justify-content:flex-end}
body.template-heritage .header-heritage .site-nav-cta{border:1px solid #ab873e;background:transparent;color:#14283e}
body.template-heritage .public-hero.seven-hero-heritage{display:grid;grid-template-columns:78px minmax(0,1.18fr) minmax(280px,.82fr);min-height:630px;background:#f2eee5;color:#14283e}
body.template-heritage .seven-hero-heritage .heritage-folio{display:flex;flex-direction:column;align-items:center;gap:20px;padding:50px 0;border-right:1px solid #baa997;color:#977343}
body.template-heritage .seven-hero-heritage .heritage-folio span{writing-mode:vertical-rl;transform:rotate(180deg);font-size:.7rem;font-weight:800;letter-spacing:.17em}
body.template-heritage .seven-hero-heritage .heritage-folio i{height:100px;width:1px;background:#977343}
body.template-heritage .seven-hero-heritage .seven-hero-copy{align-self:center;padding:50px clamp(25px,4vw,80px)}
body.template-heritage .seven-hero-heritage .tag{color:#99713d;letter-spacing:.19em}
body.template-heritage .seven-hero-heritage h1{font:500 clamp(3.5rem,5.7vw,6.5rem)/.99 var(--site-display);letter-spacing:-.063em;color:#14283e;max-width:780px;margin-block:20px}
body.template-heritage .seven-hero-heritage .intro{color:#344353}
body.template-heritage .seven-hero-heritage .hero-subtitle{color:#876232;font-size:1.35rem}
body.template-heritage .seven-hero-heritage .hero-button{border-radius:0;background:#14283e;color:white}
body.template-heritage .seven-hero-heritage .hero-text-link{color:#14283e}
body.template-heritage .seven-hero-heritage .seven-photo{height:100%;min-height:630px}
body.template-heritage .seven-hero-heritage .heritage-photo-label{position:absolute;right:0;bottom:0;width:calc((100% - 78px)*.41);background:#14283e;color:#e6bf7c;font-size:.63rem;letter-spacing:.15em;padding:16px 24px;z-index:2}
body.template-heritage .home-heritage .heritage-editorial-pair{border-top:1px solid #ae9a80;border-bottom:1px solid #ae9a80;background:#f7f2e9}
body.template-heritage .home-heritage .heritage-editorial-pair .vision-feature{border-radius:0}

/* Community — community bulletin, poster headline, playful photo notes. */
body.template-community .school-shell.shell-community{background:#f7f3e8}
body.template-community .community-announcement{background:#1d4b39;color:#fff;text-align:center;padding:10px 14px;font-size:.65rem;letter-spacing:.13em;font-weight:800}
body.template-community .school-masthead.header-community{background:#f7f3e8;min-height:94px;border:0}
body.template-community .header-community .community-logo{display:flex;align-items:center;gap:13px}
body.template-community .header-community .community-emblem{display:grid;place-items:center;width:52px;height:52px;flex-shrink:0;background:#edc75e;border-radius:52% 52% 52% 12%;color:#1d4b39;font-size:2rem}
body.template-community .header-community .brand{font:800 clamp(1.05rem,1.8vw,1.5rem)/1.05 var(--site-body);letter-spacing:-.045em;text-transform:none;color:#1d4b39}
body.template-community .header-community .site-nav-cta{border-radius:999px;background:#1d4b39;color:#fff}
body.template-community .public-hero.seven-hero-community{display:flex;flex-direction:column;justify-content:center;align-items:center;min-height:650px;padding:70px clamp(24px,5vw,76px) 0;text-align:center;background:#e8dbb2;color:#194a38;overflow:visible}
body.template-community .seven-hero-community .seven-hero-copy{max-width:1050px;order:1}
body.template-community .seven-hero-community .tag{color:#426548;font-size:.76rem;letter-spacing:.14em}
body.template-community .seven-hero-community h1{font:800 clamp(3.5rem,6.2vw,7.1rem)/.97 var(--site-body);letter-spacing:-.082em;color:#194a38;margin:20px auto;max-width:970px}
body.template-community .seven-hero-community .hero-subtitle{color:#b66e35;font-family:var(--site-display);max-width:none}
body.template-community .seven-hero-community .intro{color:#335845;margin-inline:auto}
body.template-community .seven-hero-community .hero-actions{justify-content:center}
body.template-community .seven-hero-community .hero-button{border-radius:999px;background:#1d4b39;color:white}
body.template-community .seven-hero-community .hero-text-link{color:#1d4b39}
body.template-community .seven-hero-community .community-stamp{position:absolute;top:40px;left:4%;z-index:2;border:2px dashed #a07938;border-radius:50%;width:110px;height:110px;display:grid;place-items:center;transform:rotate(-13deg);font-size:.69rem;font-weight:800;line-height:1.25;letter-spacing:.05em}
body.template-community .seven-hero-community .community-polaroids{order:2;display:grid;grid-template-columns:minmax(0,1.7fr) minmax(0,.8fr);align-items:end;gap:22px;width:min(950px,90%);height:320px;margin:40px auto 0}
body.template-community .seven-hero-community .community-photo-note{border:9px solid white;transform:rotate(-2deg);box-shadow:8px 9px 0 #1d4b3959;height:310px;min-width:0}
body.template-community .seven-hero-community .community-photo-note .seven-photo{height:100%;min-height:0}
body.template-community .seven-hero-community .community-photo-card{background:#1d4b39;color:#fff;font-weight:800;letter-spacing:-.045em;font-size:clamp(1.5rem,3vw,2.5rem);height:230px;display:flex;align-items:center;justify-content:center;text-align:center;transform:rotate(4deg);box-shadow:8px 8px 0 #c49d5a}
body.template-community .home-community .community-people-first{background:#f4eedc;border-radius:18px}

/* Modern Learning — dark workspace, always-visible left navigation and bento. */
body.template-modern .school-shell.shell-modern{display:grid;grid-template-columns:236px minmax(0,1fr);background:#080e1d;color:#e7efff;min-height:100vh}
body.template-modern .shell-modern>.school-masthead.header-modern{display:flex;flex-direction:column;position:sticky;top:0;align-self:start;height:100vh;min-width:0;max-width:none;grid-column:1;grid-row:1/3;align-items:stretch;justify-content:flex-start;gap:0;padding:28px 20px;background:#0b1225;border:0;border-right:1px solid #2c3a56}
body.template-modern .header-modern .modern-logo{display:flex;align-items:center;gap:14px}
body.template-modern .header-modern .modern-logo-mark{font:900 2.8rem/1 var(--site-body);color:#68e5f4}
body.template-modern .header-modern .brand{font:800 1.08rem/1.2 var(--site-body);letter-spacing:-.03em;text-transform:none;color:#e7efff}
body.template-modern .header-modern .rail-label{margin:40px 0 14px;color:#91aac4;letter-spacing:.17em;font-size:.65rem;font-weight:800}
body.template-modern .header-modern .desktop-nav{display:grid;gap:5px;justify-content:stretch;align-items:stretch}
body.template-modern .header-modern .desktop-nav a{color:#bbcae2;padding:13px 11px;background:#101b33;border-radius:9px;font-size:.82rem;text-transform:none;white-space:normal}
body.template-modern .header-modern .desktop-nav a[aria-current=page]{color:#72e4f2;background:#1e2e50;text-decoration:none}
body.template-modern .header-modern .modern-rail-action{margin-top:auto;padding-top:25px;width:100%}
body.template-modern .header-modern .site-nav-cta{width:100%;border-radius:6px;background:#68e5f4;color:#071527}
body.template-modern .shell-modern>main#main-content{grid-column:2;grid-row:1;min-width:0;margin:0;max-width:none;padding:28px clamp(20px,3vw,54px) 75px}
body.template-modern .shell-modern>footer{grid-column:2;grid-row:2;color:#acc0da;border-color:#31405e}
body.template-modern .shell-modern .public-hero.seven-hero-modern{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,.85fr);grid-template-rows:minmax(520px,auto) 180px;gap:14px;margin:0;padding:0;border:0;background:transparent;color:#e9efff;min-height:0}
body.template-modern .seven-hero-modern .modern-hero-panel{border:1px solid #293852;border-radius:18px;padding:clamp(27px,3vw,47px);background:linear-gradient(120deg,#142943,#181b38);grid-column:1;grid-row:1}
body.template-modern .seven-hero-modern .modern-panel-label{font-size:.65rem;letter-spacing:.19em;font-weight:800;color:#64e8f4}
body.template-modern .seven-hero-modern h1{font:850 clamp(2.7rem,4.5vw,5.1rem)/1.04 var(--site-body);letter-spacing:-.075em;color:#eff7ff;margin:19px 0}
body.template-modern .seven-hero-modern .hero-subtitle{font:500 1.3rem/1.3 var(--site-body);color:#8aeefa}
body.template-modern .seven-hero-modern .intro{color:#c7d2e6;font-size:.9rem}
body.template-modern .seven-hero-modern .hero-actions{gap:10px;margin-top:17px}
body.template-modern .seven-hero-modern .hero-button{border-radius:4px;background:#6cebf3;color:#0b1830;min-height:41px}
body.template-modern .seven-hero-modern .hero-text-link{color:#8feefa}
body.template-modern .seven-hero-modern .modern-hero-photo{grid-column:2;grid-row:1/3;border-radius:18px;overflow:hidden}
body.template-modern .seven-hero-modern .modern-hero-photo .seven-photo{height:100%}
body.template-modern .seven-hero-modern .modern-hero-tile{grid-column:1;grid-row:2;border-radius:16px;border:1px solid #2a4264;padding:24px;background:#153044;display:flex;flex-direction:column;gap:10px;justify-content:center}
body.template-modern .seven-hero-modern .modern-hero-tile>span{color:#a7c8df;font-size:.7rem}
body.template-modern .seven-hero-modern .modern-hero-tile strong{font-size:1.45rem;color:#e9f8ff}
body.template-modern .seven-hero-modern .modern-tile-alt{display:none}
body.template-modern .home-modern .modern-information-first{border-top:4px solid #68e5f4}
body.template-modern .shell-modern .home-composition .card,body.template-modern .shell-modern .home-composition .explore-link{background:#13243c;border-color:#344863;color:#e9f2ff}
body.template-modern .shell-modern .home-composition h2,body.template-modern .shell-modern .home-composition h3{color:#e9f2ff}
body.template-modern .shell-modern .home-composition p,body.template-modern .shell-modern .home-composition .explore-copy>span{color:#c2d1e5}
body.template-modern .shell-modern .home-composition .closing-action{background:#17344a}
body.template-modern .shell-modern .compact-hero{background:#172941;color:white}
body.template-modern .shell-modern .interior-modern{max-width:1200px}

/* Bright Futures — expressive, playful, round photograph and ribbon. */
body.template-bright-futures .school-shell.shell-bright{background:#fff9e9}
body.template-bright-futures .school-masthead.header-bright{min-height:95px;background:#fff9e9;border:0}
body.template-bright-futures .header-bright .bright-lockup{display:flex;align-items:center;gap:14px}
body.template-bright-futures .header-bright .bright-sun{width:53px;height:53px;flex-shrink:0;display:grid;place-items:center;border-radius:50%;border:4px solid #173a32;color:#173a32;font-size:1.65rem;background:#f4c953}
body.template-bright-futures .header-bright .brand{font:900 1.1rem/1.1 var(--site-body);letter-spacing:.03em;color:#173a32}
body.template-bright-futures .header-bright .desktop-nav{background:#fff;border:1px solid #e9e2c9;padding:3px 15px;border-radius:999px}
body.template-bright-futures .header-bright .site-nav-cta{background:#174d37;color:white;border-radius:999px}
body.template-bright-futures .public-hero.seven-hero-bright-futures{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,.75fr);min-height:600px;background:#f7cd5c;color:#173a32;padding:clamp(45px,5vw,80px)}
body.template-bright-futures .seven-hero-bright-futures .seven-hero-copy{align-self:center}
body.template-bright-futures .seven-hero-bright-futures .tag{font-size:.72rem;letter-spacing:.17em;color:#173a32}
body.template-bright-futures .seven-hero-bright-futures h1{font:900 clamp(3.8rem,6.5vw,7.4rem)/.93 var(--site-body);letter-spacing:-.075em;color:#173a32;margin:22px 0}
body.template-bright-futures .seven-hero-bright-futures .hero-subtitle{font:500 clamp(1.6rem,2.6vw,2.6rem)/1.15 var(--site-display);color:#b2593e}
body.template-bright-futures .seven-hero-bright-futures .intro{color:#3a4c3d}
body.template-bright-futures .seven-hero-bright-futures .hero-button{border-radius:999px;background:#184d39;color:white}
body.template-bright-futures .seven-hero-bright-futures .hero-text-link{color:#184d39}
body.template-bright-futures .seven-hero-bright-futures .bright-portrait{align-self:center;position:relative;padding:12px}
body.template-bright-futures .seven-hero-bright-futures .bright-portrait .seven-photo{height:410px;border:9px solid #fff;border-radius:45% 45% 15% 15%;box-shadow:15px 17px 0 #21493244}
body.template-bright-futures .seven-hero-bright-futures .bright-sticker{position:absolute;right:-12px;bottom:10px;width:115px;height:115px;border-radius:50%;border:5px solid #fff;background:#d97e78;display:grid;place-items:center;color:#fff;font-size:1.5rem;font-weight:900;line-height:1}
body.template-bright-futures .seven-hero-bright-futures .bright-spark{position:absolute;top:26px;right:4%;font-size:6rem;color:#fff9e9;transform:rotate(-15deg)}
body.template-bright-futures .home-bright .bright-family-first{border-radius:30px;background:#fff}

/* Summit — cinematic image cover, slender navigation spine, chapter-based body. */
body.template-summit .school-shell.shell-summit{position:relative;padding-left:54px;background:#f5f1e8}
body.template-summit .shell-summit .summit-spine{position:absolute;left:0;top:0;bottom:0;width:54px;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:18px 7px;background:#122f3f;color:#fff;z-index:5}
body.template-summit .summit-spine span:nth-child(2){writing-mode:vertical-rl;letter-spacing:.3em;font-size:.64rem;font-weight:800}
body.template-summit .summit-spine span:first-child{font-size:2rem}
body.template-summit .school-masthead.header-summit{background:#143041;color:#fff;border:0;padding:25px clamp(22px,4vw,70px)}
body.template-summit .header-summit .brand{font:800 1.25rem/1.18 var(--site-display);color:#fff;letter-spacing:.11em}
body.template-summit .header-summit .desktop-nav a{color:#eef3f5}
body.template-summit .header-summit .site-nav-cta{border:1px solid #d4c09b;background:transparent;color:#fff;border-radius:0}
body.template-summit .shell-summit>main#main-content{max-width:none;padding:0 0 90px}
body.template-summit .shell-summit>main#main-content>.public-hero.home-hero{margin:0}
body.template-summit .public-hero.seven-hero-summit{display:grid;place-items:center;min-height:clamp(650px,80vh,900px);background:#16384b;color:#fff;padding:clamp(60px,8vw,120px);text-align:left}
body.template-summit .seven-hero-summit .seven-photo{position:absolute;inset:0;height:100%;z-index:0}
body.template-summit .seven-hero-summit .summit-cover-overlay{position:absolute;inset:0;background:linear-gradient(90deg,#091826e8,#09182671);z-index:1}
body.template-summit .seven-hero-summit .seven-hero-copy{max-width:1040px;margin-right:auto}
body.template-summit .seven-hero-summit .summit-index{font-size:.72rem;letter-spacing:.23em;color:#e1c693}
body.template-summit .seven-hero-summit h1{font:500 clamp(4.5rem,8vw,9.2rem)/.95 var(--site-display);letter-spacing:-.077em;color:#fff;max-width:1000px}
body.template-summit .seven-hero-summit .hero-subtitle{color:#e7d8b8}
body.template-summit .seven-hero-summit .intro{color:#f1f1eb}
body.template-summit .seven-hero-summit .hero-button{background:#d9bd8b;color:#152e40;border-radius:0}
body.template-summit .seven-hero-summit .hero-text-link{color:#fff}
body.template-summit .seven-hero-summit .summit-coordinates{position:absolute;bottom:20px;right:26px;z-index:2;font-size:.63rem;letter-spacing:.19em}
body.template-summit .shell-summit .home-composition,body.template-summit .shell-summit .interior-summit{padding-left:clamp(24px,5vw,80px);padding-right:clamp(24px,5vw,80px)}
body.template-summit .shell-summit .compact-hero{margin:48px clamp(20px,5vw,80px)}

/* Heritage Classical — traditional collegiate header and three institutional pillars. */
body.template-classic .school-shell.shell-classic{background:#faf5ec;color:#253d43}
body.template-classic .classic-utility{padding:10px 5%;text-align:center;background:#183f48;color:#f5dfae;font-size:.64rem;font-weight:800;letter-spacing:.16em}
body.template-classic .school-masthead.header-classic{min-height:112px;padding:20px 5%;background:#faf5ec;border-bottom:3px double #c5a974}
body.template-classic .header-classic .classic-lockup{display:flex;align-items:center;gap:14px}
body.template-classic .header-classic .classic-crest{display:grid;place-items:center;width:56px;height:64px;flex-shrink:0;border:2px solid #ae8d56;color:#ae8d56;background:#143c45;clip-path:polygon(5% 0,95% 0,95% 72%,50% 100%,5% 72%);font-size:2rem}
body.template-classic .header-classic .brand{font:600 clamp(1.1rem,1.8vw,1.5rem)/1.08 var(--site-display);letter-spacing:.055em;color:#173c43}
body.template-classic .header-classic .site-nav-cta{border:1px solid #b59a6b;background:#173d46;color:#fff;border-radius:0}
body.template-classic .public-hero.seven-hero-classic{display:grid;grid-template-columns:minmax(0,.92fr) minmax(0,1.08fr);min-height:620px;background:#faf5ec;color:#173c43}
body.template-classic .seven-hero-classic .seven-hero-copy{align-self:center;padding:clamp(35px,5vw,85px)}
body.template-classic .seven-hero-classic .classic-emblem{font-size:2.1rem;color:#ad915c;margin-bottom:19px}
body.template-classic .seven-hero-classic .tag{color:#977742}
body.template-classic .seven-hero-classic h1{font:500 clamp(3.2rem,5.6vw,6.2rem)/1.04 var(--site-display);letter-spacing:-.06em;color:#173c43}
body.template-classic .seven-hero-classic .hero-subtitle{color:#8d6737}
body.template-classic .seven-hero-classic .intro{color:#475c5f}
body.template-classic .seven-hero-classic .hero-button{background:#173c43;color:white;border-radius:0}
body.template-classic .seven-hero-classic .hero-text-link{color:#173c43}
body.template-classic .seven-hero-classic .seven-photo{min-height:620px}
body.template-classic .home-classic .classic-pillars{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;border-block:1px solid #b8a584;background:#f3ebdc}
body.template-classic .home-classic .classic-pillars>section{padding:24px;border-right:1px solid #b8a584;min-width:0}
body.template-classic .home-classic .classic-pillars>section:last-child{border-right:0}
body.template-classic .interior-classic{display:grid;grid-template-columns:minmax(0,1.8fr) minmax(0,.6fr);gap:40px}

/* Campus Life — journal masthead and a real photo-led, multi-tile story mosaic. */
body.template-campus .school-shell.shell-campus{background:#f5f0e7;color:#26333a}
body.template-campus .school-masthead.header-campus{min-height:99px;border-bottom:2px solid #bda381;background:#f5f0e7}
body.template-campus .header-campus .campus-lockup{display:grid;line-height:1}
body.template-campus .header-campus .brand{font:900 1.8rem/1.15 var(--site-body);letter-spacing:-.06em;color:#253c46}
body.template-campus .header-campus .campus-lockup small{font-size:.63rem;letter-spacing:.19em;font-weight:800;color:#ad7e47;margin-top:4px}
body.template-campus .header-campus .site-nav-cta{border-radius:0;background:#253c46;color:white}
body.template-campus .public-hero.seven-hero-campus{display:block;background:#f5f0e7;color:#26333a;min-height:0;padding:0}
body.template-campus .seven-hero-campus .campus-intro{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(240px,.5fr);gap:50px;padding:65px clamp(24px,5vw,80px) 38px;align-items:end}
body.template-campus .seven-hero-campus .campus-intro .tag{color:#b37e42;letter-spacing:.17em}
body.template-campus .seven-hero-campus h1{font:500 clamp(3.5rem,7vw,8rem)/.97 var(--site-display);letter-spacing:-.08em;color:#26333a;max-width:920px;margin:16px 0}
body.template-campus .seven-hero-campus .hero-subtitle{color:#b37e42}
body.template-campus .seven-hero-campus .intro{color:#485a60}
body.template-campus .seven-hero-campus .hero-button{border-radius:0;background:#263e46;color:#fff}
body.template-campus .seven-hero-campus .hero-text-link{color:#263e46}
body.template-campus .seven-hero-campus .campus-side-note{border-top:1px solid #bda381;padding-top:20px;color:#4b575a;font-size:1rem;line-height:1.7}
body.template-campus .seven-hero-campus .campus-mosaic{display:grid;grid-template-columns:1.12fr .83fr 1fr;grid-template-rows:260px 230px;gap:12px;margin:0 clamp(24px,5vw,80px)}
body.template-campus .seven-hero-campus .campus-mosaic-main{grid-column:1;grid-row:1/3;position:relative;overflow:hidden}
body.template-campus .seven-hero-campus .campus-mosaic-main .seven-photo{height:100%}
body.template-campus .seven-hero-campus .campus-mosaic-main .mosaic-caption{position:absolute;left:20px;bottom:20px;color:#fff;background:#253c4688;padding:8px 12px;letter-spacing:.12em;font-size:.7rem}
body.template-campus .seven-hero-campus .campus-mosaic-tile{display:flex;flex-direction:column;justify-content:flex-end;gap:10px;padding:24px;min-width:0;color:white}
body.template-campus .seven-hero-campus .campus-mosaic-tile span{font-size:.66rem;letter-spacing:.15em;font-weight:800}
body.template-campus .seven-hero-campus .campus-mosaic-tile{position:relative;overflow:hidden;isolation:isolate}
body.template-campus .seven-hero-campus .campus-mosaic-tile img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2}
body.template-campus .seven-hero-campus .campus-mosaic-tile:has(img)::before{
 content:"";position:absolute;inset:0;background:linear-gradient(transparent,#0c1e2bd6);z-index:-1
}
body.template-campus .seven-hero-campus .campus-mosaic-tile:has(img){color:white}
body.template-modern .seven-hero-modern .modern-hero-photo{height:100%;min-height:690px}
body.template-modern .seven-hero-modern .modern-hero-photo .seven-photo{height:100%;min-height:690px}
@media(max-width:650px){
 body.template-modern .seven-hero-modern .modern-hero-photo,
 body.template-modern .seven-hero-modern .modern-hero-photo .seven-photo{min-height:280px;height:280px}
}

body.template-campus .seven-hero-campus .campus-mosaic-tile b{font:500 clamp(1.3rem,2.1vw,2.1rem)/1.17 var(--site-display)}
body.template-campus .seven-hero-campus .mosaic-second{background:#a56d47}
body.template-campus .seven-hero-campus .mosaic-third{background:#385961}
body.template-campus .seven-hero-campus .mosaic-fourth{grid-column:2/4;background:#d1b279;color:#26333a}
body.template-campus .home-campus .campus-stories{display:grid;gap:clamp(20px,3vw,42px);grid-template-columns:repeat(2,minmax(0,1fr));margin-top:56px}
body.template-campus .home-campus .campus-stories>section{padding:30px;border-top:5px solid #a87645}
body.template-campus .interior-campus{display:grid;grid-template-columns:minmax(0,1.8fr) minmax(0,.6fr);gap:40px}

body.template-summit .header-summit .summit-lockup{display:flex;align-items:center;gap:13px}
body.template-summit .header-summit .summit-logo-mark{flex-shrink:0;display:grid;place-items:center;width:46px;height:46px;border:1px solid #d4c09b;color:#d4c09b;font-family:var(--site-display);font-size:1.25rem}
body.template-campus .header-campus .campus-lockup{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:12px;align-items:center}
body.template-campus .header-campus .campus-logo-mark{grid-row:1/3;display:grid;place-items:center;min-width:44px;min-height:44px;padding:4px;border:2px solid var(--site-ink);font-weight:800;font-size:1.15rem}
body.template-campus .header-campus .campus-lockup small{grid-column:2}
/* Responsive behavior belongs to hosted school pages only. */
@media(max-width:1180px){
  .school-shell .school-masthead{gap:12px;padding-inline:22px}
  .school-shell .school-masthead .desktop-nav{gap:9px}
  .school-shell .school-masthead .desktop-nav a{font-size:.69rem}
  body.template-heritage .school-masthead.header-heritage{grid-template-columns:auto minmax(0,1fr)}
  body.template-heritage .header-heritage .edition{display:none}
  body.template-heritage .public-hero.seven-hero-heritage{grid-template-columns:58px minmax(0,1.1fr) minmax(220px,.8fr)}
  body.template-heritage .seven-hero-heritage .heritage-photo-label{display:none}
  body.template-modern .school-shell.shell-modern{grid-template-columns:204px minmax(0,1fr)}
  body.template-modern .seven-hero-modern .modern-hero-panel{padding:25px}
  body.template-classic .home-classic .classic-pillars{display:block}
  body.template-classic .home-classic .classic-pillars>section{border-right:0;border-bottom:1px solid #b8a584}
}
@media(max-width:800px){
  .school-shell .school-masthead .desktop-nav,.school-shell .school-masthead>.site-nav-cta,
  .school-shell .header-heritage .masthead-navigation>.site-nav-cta,
  .school-shell .header-modern .modern-rail-action{display:none}
  .school-shell .school-masthead .mobile-menu{display:block;position:relative;margin-left:auto;color:inherit}
  .school-shell .school-masthead .mobile-menu summary{border-color:currentColor}
  .school-shell .school-masthead .mobile-menu[open]{width:auto}
  .school-shell .school-masthead .mobile-menu[open] .mobile-links{position:absolute;display:grid;top:52px;right:0;z-index:30;width:min(340px,calc(100vw - 38px));background:var(--site-paper);color:var(--site-ink);padding:18px;border:1px solid #b8c2c4;box-shadow:0 12px 30px #0003;grid-template-columns:1fr}
  .school-shell .school-masthead .mobile-menu[open] .mobile-links a{white-space:normal;color:var(--site-ink)}
  body.template-heritage .school-masthead.header-heritage{display:flex;align-items:center;gap:12px}
  body.template-heritage .header-heritage .school-lockup{flex:1}
  body.template-heritage .header-heritage .masthead-navigation{margin-left:auto}
  body.template-community .seven-hero-community .community-stamp{width:70px;height:70px;font-size:.45rem;top:14px;left:2%}
  body.template-modern .school-shell.shell-modern{display:block}
  body.template-modern .shell-modern>.school-masthead.header-modern{position:relative;height:auto;min-height:72px;display:flex;flex-direction:row;align-items:center;justify-content:space-between;padding:12px 22px}
  body.template-modern .header-modern .rail-label{display:none}
  body.template-modern .shell-modern>main#main-content{padding:24px 18px 70px}
  body.template-modern .shell-modern>footer{margin-left:0}
  body.template-modern .seven-hero-modern .modern-hero-panel{min-height:380px}
  body.template-summit .school-shell.shell-summit{padding-left:40px}
  body.template-summit .shell-summit .summit-spine{width:40px}
}
@media(max-width:650px){
  .school-shell main#main-content{padding-top:18px;padding-bottom:60px}
  .school-shell main#main-content>.public-hero.home-hero{margin:0 -20px}
  .school-shell .school-masthead{padding-inline:16px}
  .school-shell .school-masthead .brand{font-size:.95rem}
  body.template-heritage .public-hero.seven-hero-heritage{grid-template-columns:1fr;display:flex;flex-direction:column;min-height:0}
  body.template-heritage .seven-hero-heritage .heritage-folio{display:none}
  body.template-heritage .seven-hero-heritage .seven-hero-copy{padding:38px 25px}
  body.template-heritage .seven-hero-heritage .seven-photo{width:100%;height:300px;min-height:300px}
  body.template-community .public-hero.seven-hero-community{padding:75px 22px 0;min-height:0}
  body.template-community .seven-hero-community .community-polaroids{height:230px;width:100%;gap:12px}
  body.template-community .seven-hero-community .community-photo-note{height:215px;border-width:5px}
  body.template-community .seven-hero-community .community-photo-card{height:145px;font-size:1.3rem}
  body.template-modern .shell-modern .public-hero.seven-hero-modern{display:flex;flex-direction:column;gap:12px}
  body.template-modern .seven-hero-modern .modern-hero-panel{min-height:0;padding:28px 24px}
  body.template-modern .seven-hero-modern .modern-hero-photo{height:280px;min-height:280px}
  body.template-modern .seven-hero-modern .modern-hero-tile{min-height:150px}
  body.template-bright-futures .public-hero.seven-hero-bright-futures{display:flex;flex-direction:column;padding:45px 25px 70px}
  body.template-bright-futures .seven-hero-bright-futures .bright-portrait{margin-top:25px;width:100%}
  body.template-bright-futures .seven-hero-bright-futures .bright-portrait .seven-photo{height:280px}
  body.template-bright-futures .seven-hero-bright-futures .bright-sticker{width:75px;height:75px;font-size:1rem;right:5px}
  body.template-summit .shell-summit .public-hero.seven-hero-summit{min-height:620px;padding:50px 28px}
  body.template-classic .public-hero.seven-hero-classic{display:flex;flex-direction:column}
  body.template-classic .seven-hero-classic .seven-hero-copy{padding:45px 25px}
  body.template-classic .seven-hero-classic .seven-photo{height:310px;min-height:310px;width:100%}
  body.template-classic .interior-classic,body.template-campus .interior-campus{display:block}
  body.template-campus .seven-hero-campus .campus-intro{display:block;padding:44px 25px 26px}
  body.template-campus .seven-hero-campus .campus-mosaic{grid-template-columns:1fr 1fr;grid-template-rows:210px 180px 180px;margin:0 16px}
  body.template-campus .seven-hero-campus .campus-mosaic-main{grid-column:1/3;grid-row:1}
  body.template-campus .seven-hero-campus .mosaic-second{grid-column:1;grid-row:2}
  body.template-campus .seven-hero-campus .mosaic-third{grid-column:2;grid-row:2}
  body.template-campus .seven-hero-campus .mosaic-fourth{grid-column:1/3;grid-row:3}
  body.template-campus .home-campus .campus-stories{display:block}
  .school-shell .public-hero.home-hero h1{font-size:clamp(2.9rem,11vw,4.7rem)}
}

`;

/** Interior compositions consume the same approved fragments; no template invents facts. */
export function composePublicSiteInterior(template: SiteTemplateId, hero: string, primary: string, secondary = ""): string {
  switch (template) {
    case "community": return hero + `<div class="interior-community"><div class="interior-story">${primary}</div><aside class="interior-related">${secondary}</aside></div>`;
    case "modern": return `<div class="interior-modern">${hero}<div class="interior-main">${primary}</div><div class="interior-related">${secondary}</div></div>`;
    case "bright-futures": return hero + `<div class="interior-bright"><div class="interior-main">${primary}</div><div class="interior-related">${secondary}</div></div>`;
    case "summit": return hero + `<div class="interior-summit"><div class="interior-main">${primary}</div><div class="interior-related">${secondary}</div></div>`;
    case "classic": return hero + `<div class="interior-classic"><div class="interior-main">${primary}</div><aside class="interior-related">${secondary}</aside></div>`;
    case "campus": return hero + `<div class="interior-campus"><div class="interior-main">${primary}</div><aside class="interior-related">${secondary}</aside></div>`;
    default: return hero + `<article class="interior-heritage">${primary}<div class="interior-related">${secondary}</div></article>`;
  }
}

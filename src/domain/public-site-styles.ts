import { publicSiteTemplateCss, sevenSchoolCss } from "./public-site-templates";

/** Static, reviewed CSS for all public Site templates. Site-controlled values
 * still enter only through the existing escaped visual CSS and approved models.
 * Keeping layout CSS separate prevents copy edits from changing the stylesheet.
 */
export const publicSiteStyles = `:root{line-height:1.65}
body.theme-warm,body.theme-light{color:var(--site-ink);background:var(--site-paper)}
*{box-sizing:border-box}body{margin:0}header,main,footer{max-width:1240px;margin:auto;padding-left:clamp(20px,4vw,52px);padding-right:clamp(20px,4vw,52px)}
header{padding-top:24px;padding-bottom:22px;border-bottom:1px solid #dce2e8;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px}
.brand{font-size:.72rem;letter-spacing:.13em;text-transform:uppercase;font-weight:800;color:#3b5365;line-height:1.6}
h1{font-family:var(--site-display);font-size:clamp(2.8rem,7vw,6.25rem);letter-spacing:-.055em;margin:18px 0 14px;line-height:1.07;max-width:850px}
h2{font-family:var(--site-display);font-size:clamp(1.7rem,3.5vw,2.65rem);font-weight:500;letter-spacing:-.038em;margin:0 0 18px}.intro{color:#475467;max-width:700px;line-height:1.6}
main{padding-top:38px;padding-bottom:112px}main>section+section{margin-top:clamp(48px,8vw,112px)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:18px;margin-top:28px}
.card{border:1px solid #e6e2d9;border-radius:18px;padding:clamp(24px,3vw,34px);background:#fff;box-shadow:0 12px 40px rgba(22,43,66,.055)}
.card h3{font-family:var(--site-display);font-size:1.45rem;font-weight:500;line-height:1.22;margin:12px 0}
.tag{font-size:.72rem;letter-spacing:.07em;text-transform:uppercase;color:#475467;font-weight:700}
.season,.availability{font-size:.9rem;color:#475467;line-height:1.5}
.price{font-weight:700;font-size:1.16rem;margin-top:20px}
.empty{padding:28px;border:1px solid #dce2e8;border-radius:14px;background:white}
.church-section{border:1px solid #e5e2d9;border-radius:22px;padding:clamp(24px,5vw,64px);background:#fff;margin-bottom:48px}.church-section>.local-field{max-width:780px;padding:22px 0;border-top:1px solid #eeece7}.church-section>.local-field:first-of-type{border-top:0}.church-section>.local-field h3{font-family:Georgia,Cambria,serif;font-size:1.35rem;font-weight:500}
.local-field{margin-top:18px}.local-field h3{font-size:1rem;margin:0 0 6px}
.local-field p{white-space:pre-line;overflow-wrap:anywhere;color:#475467;line-height:1.6;margin:0}
.local-hero-image{display:block;width:100%;max-height:420px;object-fit:cover;border-radius:14px;margin:18px 0 24px}
footer{border-top:1px solid #dce2e8;padding-top:22px;padding-bottom:40px;font-size:.82rem;color:#667085}
.inquiry-form{margin-top:22px;padding-top:18px;border-top:1px solid #dce2e8;display:grid;gap:12px}
.inquiry-form label{display:grid;gap:5px;font-size:.82rem;color:#475467}
.inquiry-form input:not([type=checkbox]),.inquiry-form textarea,.inquiry-form select{width:100%;padding:10px;border:1px solid #bcc6d2;border-radius:8px;font:inherit}
.inquiry-form .consent{display:flex;align-items:start;gap:8px;line-height:1.4}
.inquiry-form button{background:#173c60;color:white;border:none;border-radius:10px;padding:14px;font-weight:700;cursor:pointer;min-height:44px}
.inquiry-form button:hover{background:#245b88}
:focus-visible{outline:3px solid #e7a84e;outline-offset:3px}
.public-hero{min-height:440px;position:relative;isolation:isolate;overflow:hidden;border-radius:28px;background:linear-gradient(110deg,var(--site-ink),var(--site-secondary));padding:clamp(30px,6vw,70px);color:white;margin-bottom:52px}
.public-hero h1{color:white}.public-hero .intro{color:#edf3f8;max-width:670px}
.public-hero::after{content:"";position:absolute;inset:0;z-index:-1;background:var(--site-accent);opacity:.18;clip-path:polygon(0 100%,0 88%,32% 70%,56% 90%,78% 53%,100% 66%,100% 100%)}.hero-background-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2}.public-hero.has-image::before{content:"";position:absolute;inset:0;background:linear-gradient(95deg,rgba(13,34,40,.94),rgba(13,34,40,.5));z-index:-1}.public-hero.has-image::after{display:none}
.public-hero .tag{color:#e7d7bd}.hero-actions{display:flex;align-items:center;flex-wrap:wrap;gap:20px;margin-top:30px}.hero-button{display:inline-flex;align-items:center;min-height:48px;border-radius:10px;padding:12px 19px;background:#f6eee0;color:#17364d;text-decoration:none;font-weight:700}.hero-text-link{color:#fff;text-underline-offset:5px;font-weight:700}.hero-button:hover{background:#fff}.hero-button:focus-visible,.hero-text-link:focus-visible{outline:3px solid #ffda90;outline-offset:4px}
.skip-link{position:absolute;left:12px;top:-100px;z-index:10;padding:12px;background:#fff;color:#112d34}.skip-link:focus{top:12px}.mission-split{display:grid;grid-template-columns:1fr 1fr;align-items:start;gap:clamp(24px,5vw,80px);padding:clamp(20px,4vw,42px) 0}.mission-split p:last-child{font-size:clamp(1.05rem,1.6vw,1.3rem);line-height:1.75}.editorial-section>.grid{gap:20px}.closing-action{background:var(--site-ink);color:#fff;padding:clamp(30px,6vw,70px);border-radius:12px}.closing-action .tag,.closing-action p{color:#fff}.closing-action h2{max-width:700px}.closing-action .hero-button{margin-top:15px}header nav a{min-height:44px;display:inline-flex;align-items:center}.site-nav-cta{min-height:44px;display:inline-flex;align-items:center;justify-content:center;background:var(--site-ink);color:#fff;padding:10px 17px;border-radius:5px;text-decoration:none;font-weight:700;font-size:.85rem}.site-nav-cta:hover{background:var(--site-secondary)}header .brand{color:var(--site-ink)}header{position:relative}header nav{gap:clamp(8px,1.4vw,20px)}.card{border-radius:8px}.card p{overflow-wrap:anywhere}.public-hero{border-radius:12px}.church-section{border-radius:8px}.public-hero h1{overflow-wrap:break-word;hyphens:auto}.public-hero.long-name h1{font-size:clamp(1.9rem,5.6vw,5rem);letter-spacing:-.04em;max-width:950px} .mobile-menu{display:none} .mobile-menu summary{cursor:pointer;min-height:44px;display:flex;align-items:center;padding:8px 14px;border:1px solid var(--site-ink);border-radius:6px}.mobile-menu a{display:block;padding:11px 4px;min-height:44px} .mobile-menu[open]{width:100%} .mobile-menu[open] .mobile-links{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px} @media(max-width:800px){header>.desktop-nav,header>.site-nav-cta{display:none}.mobile-menu{display:block} .mission-split{grid-template-columns:1fr} .public-hero{min-height:350px}} @media(max-width:600px){.grid{grid-template-columns:1fr}.public-hero{border-radius:12px;min-height:0;padding:clamp(24px,6vw,48px)}.card{padding:22px}header{align-items:flex-start}header nav{order:3;width:100%;overflow-x:auto;flex-wrap:nowrap;white-space:nowrap;padding-top:12px}main{padding-top:24px;padding-bottom:60px}}
.section-heading{max-width:740px;margin-bottom:32px}.section-heading>p:last-child{color:#475467}.explore-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.explore-link{display:flex;align-items:flex-start;gap:16px;min-width:0;padding:clamp(18px,3vw,30px);border-top:2px solid var(--site-ink);background:#fff;color:var(--site-ink);text-decoration:none;transition:background .2s ease,transform .2s ease}.explore-link:hover{background:#f4f5f2;transform:translateY(-2px)}.explore-number{font-size:.75rem;letter-spacing:.1em;color:#526578;font-weight:700;padding-top:5px}.explore-copy{display:grid;gap:7px;flex:1;min-width:0}.explore-copy strong{font-family:var(--site-display);font-size:clamp(1.3rem,2vw,1.8rem);font-weight:500;line-height:1.2}.explore-copy>span{font-size:.9rem;color:#475467;line-height:1.55}.explore-arrow{font-size:1.4rem;line-height:1.1;align-self:center}.explore-link:focus-visible{outline:3px solid var(--site-accent);outline-offset:3px}
.public-hero.has-image{background:#16373d}.public-hero.has-image::before{background:linear-gradient(90deg,rgba(9,28,38,.96) 0%,rgba(9,28,38,.78) 52%,rgba(9,28,38,.32) 100%)}.public-hero .intro{position:relative}.inquiry-form input:not([type=checkbox]):focus-visible,.inquiry-form textarea:focus-visible,.inquiry-form select:focus-visible{outline-offset:2px}@media(max-width:700px){.explore-grid{grid-template-columns:1fr}.explore-link{padding:20px}.public-hero.has-image::before{background:linear-gradient(90deg,rgba(9,28,38,.94),rgba(9,28,38,.67))}}@media(max-width:375px){.mobile-menu[open] .mobile-links{grid-template-columns:1fr}.public-hero h1{font-size:clamp(2.1rem,11vw,3.2rem)}.hero-actions{align-items:stretch;gap:12px}.hero-button{justify-content:center}.explore-link{gap:12px}}\n .contact-details{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:24px;margin:24px 0;padding:22px 0;border-top:1px solid #e5e2d9;border-bottom:1px solid #e5e2d9}.contact-details h3{font-family:var(--site-display);font-size:1.3rem;font-weight:500;margin:0 0 6px}.contact-details p{white-space:pre-line;overflow-wrap:anywhere;margin:0}.admissions-status{border-left:3px solid var(--site-accent);padding:12px 18px;background:#fff}.admissions-next-steps{max-width:900px}.admissions-next-steps>p:not(.tag){color:#475467;line-height:1.75}.text-action{display:inline-flex;margin:12px 20px 8px 0;color:var(--site-ink);font-weight:700;text-underline-offset:5px}.public-next-step{margin-top:32px;font-weight:700}.public-next-step a{color:var(--site-ink);text-underline-offset:5px}.disclosure-item{border-top:1px solid #e5e2d9;padding:20px 0}.disclosure-item h3{font-family:var(--site-display);font-size:1.3rem;margin:0 0 8px}.disclosure-item p{margin:0;color:#475467;white-space:pre-line;overflow-wrap:anywhere}
.community-section{margin-top:clamp(36px,8vw,108px)}.community-heading{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(230px,.7fr);gap:clamp(20px,5vw,90px);align-items:end;border-top:2px solid var(--site-ink);padding-top:30px;margin-bottom:34px}.community-heading h2{font-size:clamp(2rem,4.5vw,4.2rem);line-height:1.13;max-width:700px}.community-heading>p{color:var(--site-muted);font-size:1.06rem;line-height:1.8}.community-stories{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 clamp(22px,5vw,72px)}.community-story{padding:28px 0;border-top:1px solid #cdd2cd;min-width:0}.community-story h3{font-family:var(--site-display);font-size:clamp(1.25rem,2.4vw,1.9rem);font-weight:500;line-height:1.25;margin:8px 0 12px}.community-story p:last-child{white-space:pre-line;overflow-wrap:anywhere;color:#475467;line-height:1.75}.story-index{margin:0;font-size:.76rem;letter-spacing:.12em;font-weight:700;color:var(--site-muted)}.community-photo{width:100%;max-height:580px;object-fit:cover;margin-bottom:34px}.community-section>.availability{margin-top:16px}@media(max-width:700px){.community-heading{grid-template-columns:1fr}.community-stories{grid-template-columns:1fr}.community-story{padding:24px 0}}
.hero-subtitle{font-family:var(--site-display);font-size:clamp(1.5rem,3vw,2.85rem);font-weight:500;line-height:1.2;letter-spacing:-.028em;max-width:760px;margin:20px 0 20px;color:#fff}.public-hero h1{max-width:1100px}.public-hero.has-image .hero-subtitle{text-shadow:0 1px 12px rgba(0,0,0,.15)}
.program-jump-nav{margin:28px 0;padding:22px;border:1px solid #dce2e8;border-radius:8px}.program-jump-links{display:flex;flex-wrap:wrap;gap:12px}.program-jump-links a{display:inline-block;padding:10px 14px;border:1px solid currentColor;border-radius:5px;text-underline-offset:3px}.program-jump-links a:focus-visible{outline:3px solid var(--site-accent);outline-offset:3px}
.approved-program-schedule{margin-top:24px;padding:22px;background:var(--site-paper);border:1px solid #dce2e8;border-radius:8px}.approved-program-schedule h4{margin:0 0 14px;font-size:1.07rem}.schedule-periods{list-style:none;margin:0;padding:0}.schedule-periods li{display:flex;justify-content:space-between;gap:12px;border-top:1px solid #dce2e8;padding:12px 0;flex-wrap:wrap}.schedule-periods li strong{min-width:110px}.schedule-periods li span{font-variant-numeric:tabular-nums}.schedule-periods+.availability{margin:12px 0 0}
.inquiry-form{margin-top:22px;padding:clamp(18px,3vw,28px);background:var(--site-paper);border:1px solid #dce2e8;border-radius:10px;display:grid;gap:16px}
.inquiry-form label:not(.consent){display:flex;flex-direction:column;gap:7px;font-weight:650;font-size:.9rem}
.inquiry-form input:not([type=checkbox]):not([type=hidden]),.inquiry-form textarea,.inquiry-form select{display:block;width:100%;max-width:100%;font:inherit;padding:12px 13px;border:1px solid #8b989e;border-radius:5px;background:#fff;color:#172d38}
.inquiry-form input:focus-visible,.inquiry-form textarea:focus-visible,.inquiry-form select:focus-visible,.inquiry-form button:focus-visible{outline:3px solid var(--site-accent);outline-offset:3px}
.inquiry-form .consent{display:flex;align-items:flex-start;gap:10px;font-size:.88rem;line-height:1.5}
.inquiry-form .consent input{margin-top:4px;width:18px;height:18px;flex:0 0 18px}
.inquiry-form button{width:100%;padding:13px 18px;min-height:46px;border:0;border-radius:5px;background:var(--site-ink);color:#fff;font:inherit;font-weight:700;cursor:pointer}
.inquiry-form button:hover{filter:brightness(1.18)}
.inquiry-form h4{font-size:1.1rem;line-height:1.3;margin:0}
@media(prefers-reduced-motion:reduce){.inquiry-form button{transition:none}}
 .demo-banner{padding:9px 22px;background:#162e39;color:#f9f5ed;text-align:center;font-size:.78rem;line-height:1.5;letter-spacing:.01em}.demo-banner strong{font-weight:700}.vision-feature{display:grid;grid-template-columns:minmax(90px, .3fr) minmax(0,1fr);gap:clamp(20px,5vw,80px);background:var(--site-ink);color:#fff;padding:clamp(28px,5vw,72px);border-radius:5px;margin:clamp(24px,5vw,64px) 0}.vision-feature h2{max-width:800px;font-size:clamp(2.1rem,4.5vw,4.3rem);line-height:1.13;letter-spacing:-.045em}.vision-feature p:not(.tag){color:#e3e6e0;max-width:800px;font-size:1.1rem;line-height:1.8}.vision-feature .tag{color:#e8c996}.vision-number{font-family:var(--site-display);font-size:clamp(4rem,11vw,10rem);line-height:1;color:#d5ac69}.hero-art{pointer-events:none;position:absolute;right:-3%;bottom:-24%;width:min(52%,580px);aspect-ratio:1;border:1px solid rgba(255,255,255,.32);border-radius:50%;opacity:.55;z-index:-1}.hero-art .art-ring{position:absolute;inset:15%;border:1px solid rgba(255,255,255,.45);border-radius:50%}.hero-art .art-line{position:absolute;top:6%;left:45%;width:1px;height:90%;background:rgba(255,255,255,.35);transform:rotate(34deg)}.hero-art .art-dot{position:absolute;top:18%;left:12%;height:12px;width:12px;border-radius:50%;background:#f2d19b}.public-hero.has-image .hero-art{display:none}@media(max-width:700px){.vision-feature{grid-template-columns:1fr}.vision-number{font-size:4rem}.hero-art{width:75%;right:-30%;bottom:-18%;opacity:.3}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;transition:none!important}}
.home-story{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:clamp(30px,6vw,110px);padding:clamp(38px,6vw,84px) 0;border-block:1px solid #cdd2cd}.home-story-heading h2{max-width:660px;font-size:clamp(2.8rem,5.5vw,5.8rem);line-height:1.03}.home-story-copy{max-width:570px;align-self:center}.home-story-copy>p{font-size:clamp(1.12rem,1.65vw,1.4rem);line-height:1.72;color:var(--site-muted);white-space:pre-line}.home-story-copy .text-action{margin-top:22px}.program-overview-heading{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(220px,.8fr);gap:clamp(24px,5vw,88px);align-items:end;margin-bottom:26px}.program-overview-heading>p{font-size:1.06rem;line-height:1.7;color:var(--site-muted)}.program-overview .grid{margin-top:0}.program-overview>.text-action{margin-top:26px}.editorial-section .tag{color:var(--site-secondary)}@media(max-width:760px){.home-story,.program-overview-heading{grid-template-columns:1fr}.home-story{gap:14px;padding:42px 0}.program-overview-heading{gap:12px}}
.people-grid,.approach-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:clamp(20px,3vw,46px);margin:28px 0}.person-card,.approach-card{border-top:2px solid var(--site-ink);padding:24px 0}.person-card h3,.approach-card h3{font-family:var(--site-display);font-weight:500;font-size:clamp(1.4rem,2.2vw,2rem);margin:0 0 8px}.person-card p:last-child{white-space:pre-line;line-height:1.7;color:var(--site-muted)}.person-title{font-weight:700;font-size:.88rem;color:var(--site-secondary)}.approach-section>p:not(.tag),.approach-card p{color:var(--site-muted)}.approach-card ul{padding-left:22px;line-height:1.8}.faq-list{max-width:920px;margin-inline:auto}.faq-item{border-top:1px solid var(--site-ink);padding:20px 0}.faq-item:last-child{border-bottom:1px solid var(--site-ink)}.faq-item summary{cursor:pointer;font-family:var(--site-display);font-size:clamp(1.2rem,2vw,1.55rem);line-height:1.35;min-height:44px}.faq-item p{max-width:760px;white-space:pre-line;color:var(--site-muted);line-height:1.75}
.demo-experience-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(18px,3vw,42px);margin:36px 0 20px}.demo-experience-grid article{min-width:0;border-top:2px solid var(--site-ink);padding-top:24px}.demo-experience-grid h3{font-family:var(--site-display);font-size:clamp(1.6rem,2.4vw,2.35rem);line-height:1.18;letter-spacing:-.035em;font-weight:500}.demo-experience-grid p:last-child{color:var(--site-muted);line-height:1.7}@media(max-width:760px){.demo-experience-grid{grid-template-columns:1fr}.demo-experience-grid article{padding-top:18px}}
 .bot-field{display:none}
header nav{display:flex;flex-wrap:wrap;gap:16px;font-size:.85rem}header nav a[aria-current=page]{font-weight:800;text-decoration-thickness:2px}.compact-hero{padding-block:clamp(28px,5vw,52px)}.compact-hero h1{font-size:clamp(2.3rem,5vw,4rem)}header nav a{color:inherit;text-underline-offset:5px;text-decoration-color:#9ca9ab}header nav a:hover{text-decoration-color:currentColor}html{scroll-behavior:smooth}
/* Editorial school identity: human-scale typography, generous negative space,
   photography-ready hero and a quiet, heritage-inspired visual rhythm. */
body{font-family:var(--site-body);color:var(--site-ink);background:var(--site-paper);font-size:1.04rem;letter-spacing:-.005em}
header{padding-top:29px;padding-bottom:29px;gap:24px}
header .brand{font-family:var(--site-display);font-size:.93rem;letter-spacing:.08em;font-weight:700}
header nav{gap:clamp(14px,1.8vw,28px)}
main{padding-top:clamp(22px,3vw,48px)}
.public-hero:not(.compact-hero){min-height:clamp(510px,66vh,760px);display:flex;flex-direction:column;align-items:flex-start;justify-content:center;padding:clamp(36px,8vw,110px);border-radius:4px}
.public-hero:not(.compact-hero) h1{font-size:clamp(4rem,8.2vw,8rem);line-height:.98;max-width:880px;letter-spacing:-.072em}
.public-hero:not(.has-image){background:var(--site-ink)}
.public-hero:not(.has-image)::after{display:none}
.public-hero .hero-art{display:none}
.public-hero .intro{font-size:clamp(1rem,1.3vw,1.2rem);max-width:630px;line-height:1.7}
.public-hero .hero-subtitle{font-size:clamp(1.85rem,3.2vw,3.1rem);max-width:700px;line-height:1.2}
.editorial-section>h2,.section-heading h2{font-size:clamp(2.3rem,4.4vw,4.75rem);line-height:1.1}
.editorial-section>.grid .card{box-shadow:none;border-radius:2px;border:1px solid rgba(18,33,29,.15);padding:clamp(28px,3vw,44px)}
.explore-link{background:transparent;border-top:1px solid var(--site-ink);transition:background .15s ease}
.explore-link:hover{background:rgba(18,33,29,.055);transform:none}
.closing-action{border-radius:3px;padding-block:clamp(54px,7vw,100px)}
.closing-action h2{font-size:clamp(2.4rem,4vw,4.7rem);line-height:1.07}
.compact-hero{border-radius:3px;background:var(--site-ink);min-height:280px;padding:clamp(32px,5vw,74px)}
.compact-hero::after{display:none}
.compact-hero h1{font-size:clamp(2.6rem,5.5vw,5.6rem);line-height:1.04}
@media(max-width:700px){.public-hero:not(.compact-hero){min-height:510px;padding:32px}.public-hero:not(.compact-hero) h1{font-size:clamp(3.2rem,12vw,5.2rem)}.public-hero .hero-subtitle{font-size:clamp(1.6rem,6vw,2.4rem)}.compact-hero{min-height:240px}}

/* A Site content block uses template fonts, layout and tokens, not an injected white box. */
.site-content-block{background:transparent;color:inherit;min-width:0;max-width:100%}
.site-content-block .program-overview-heading h2{font-family:var(--site-display);letter-spacing:-.045em}
.site-content-block .program-overview-heading>p{color:var(--site-muted)}
.site-content-block .site-channel-card{min-width:0;border-radius:2px;box-shadow:none;color:var(--site-ink);background:var(--site-paper);border:1px solid var(--site-secondary);padding:clamp(22px,3vw,34px)}
.site-content-block .site-channel-card h3{font-family:var(--site-display);font-size:clamp(1.35rem,2.2vw,2rem);font-weight:500;line-height:1.18}
.site-content-block .site-channel-card>p:not(.tag){color:var(--site-muted);line-height:1.65}
.site-content-block .site-channel-grid{margin-top:18px;grid-template-columns:repeat(auto-fit,minmax(min(100%,245px),1fr))}
.site-content-block.site-channel-list .site-channel-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
.site-content-block.site-channel-list .site-channel-card{background:transparent;border:0;border-top:2px solid var(--site-ink);padding:22px 0}
.site-content-block.site-channel-featured .site-channel-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
.site-content-block.site-channel-featured .site-channel-card:first-child{grid-row:span 2;background:var(--site-secondary);color:#fff;border-color:var(--site-secondary)}
.site-content-block.site-channel-featured .site-channel-card:first-child>p,.site-content-block.site-channel-featured .site-channel-card:first-child .tag{color:inherit}
body.template-modern .site-content-block .site-channel-card{background:#142b44;border-color:#36506d;color:#eaf3ff}
body.template-modern .site-content-block .site-channel-card>p:not(.tag){color:#c0d0e1}
body.template-modern .site-content-block .site-channel-card .tag{color:#83e4f1}
body.template-modern .site-content-block .program-overview-heading>p{color:#c0d0e1}
body.template-modern .site-content-block.site-channel-list .site-channel-card{background:transparent;border-color:#607b97}
body.template-modern .site-content-block.site-channel-featured .site-channel-card:first-child{background:#225064;color:#eaf3ff}
@media(max-width:760px){.site-content-block.site-channel-list .site-channel-grid,.site-content-block.site-channel-featured .site-channel-grid{grid-template-columns:1fr}}

${publicSiteTemplateCss}
/* Consistent public preopening disclosure across all seven school designs. */
.launch-status-banner{padding:14px clamp(20px,4vw,52px);background:#fff3d8;color:#3d2d15;border-bottom:1px solid #c9a663;font:600 14px/1.55 system-ui,sans-serif}
.launch-status-banner strong{display:block;font-weight:800}
.template-photo-extra{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);
  gap:clamp(22px,4vw,56px);align-items:center;margin:42px 0;padding:clamp(18px,3vw,32px);
  border:1px solid rgba(55,65,81,.18);border-radius:12px}
.template-photo-extra img{display:block;width:100%;max-height:440px;aspect-ratio:4/3;object-fit:cover;border-radius:8px}
.template-photo-extra-portrait img{aspect-ratio:4/5;max-height:460px;max-width:350px}
.template-photo-extra h2{font-size:clamp(1.6rem,2.6vw,2.6rem);line-height:1.15}
.template-photo-extra p:last-child{line-height:1.7}
@media(max-width:760px){.template-photo-extra{grid-template-columns:1fr}
  .template-photo-extra img{max-width:100%;max-height:380px}}
${sevenSchoolCss}
.school-logo{display:inline-block;width:48px;height:48px;object-fit:contain;vertical-align:middle;margin-right:12px}.brand{overflow-wrap:anywhere}
.leadership-grid{grid-template-columns:repeat(auto-fit,minmax(230px,1fr))}
.leadership-person{min-width:0}.leadership-person .tag{margin:10px 0}
.leadership-photo{display:block;aspect-ratio:4/5;max-height:340px;width:100%;object-fit:cover;margin-bottom:16px}`;

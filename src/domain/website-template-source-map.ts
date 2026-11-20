import { composePublicSiteHome } from "./public-site-templates";
import { publicSitePagePaths, type PublicSitePath } from "./public-site-paths";
import type { SiteTemplateId } from "./site-theme";
import type { PublicSiteHomeSections } from "./public-site-templates";

export type WebsiteSourceKind =
  | "site-identity" | "site-copy" | "site-story" | "site-media"
  | "approved-records" | "site-layout" | "template-copy" | "computed";

export type WebsiteElementSource = {
  element: string;
  source: string;
  details: string;
  editAt: string;
  kind: WebsiteSourceKind;
};

export type WebsiteSectionSource = {
  key: string;
  title: string;
  description: string;
  appearsWhen: string;
  elements: readonly WebsiteElementSource[];
};

const field=(element:string, source:string, details:string, editAt:string,
  kind:WebsiteSourceKind):WebsiteElementSource =>
  ({element,source,details,editAt,kind});

const template=(element:string,details:string):WebsiteElementSource=>
  field(element,"CAN OS template renderer",details,"Fixed layout copy, not editable in Website & Brand","template-copy");
const authored=(element:string,key:string,details:string):WebsiteElementSource=>
  field(element,"Site website draft · "+key,details,"Establish → Website & Brand → Your Content","site-copy");
const brand=(element:string,details:string):WebsiteElementSource=>
  field(element,"Current immutable Site Brand version",details,
    "Establish → Website & Brand → Brand Identity / Visual Identity","site-identity");
const approved=(element:string,source:string,details:string):WebsiteElementSource=>
  field(element,source,details,"Edit and approve in the owning Site/Program/Course module, not in the template","approved-records");
const sourceLayout=(element:string,details:string):WebsiteElementSource=>
  field(element,"Site website content-channel configuration",details,
    "Establish → Website & Brand → Your Content → Arrange website sections","site-layout");
const derived=(element:string,details:string):WebsiteElementSource=>
  field(element,"CAN OS approved-content projection",details,
    "Determined by verified source records and publication rules; not a separate website value","computed");

export const websiteChromeSources:readonly WebsiteElementSource[]=[
  brand("School name and wordmark","Exact saved Brand display name (or Site name when there is no saved Brand). Never remove or replace words such as Demo."),
  brand("Logo or monogram","Saved rights-cleared logo where available; otherwise initials calculated from the exact displayed school name."),
  field("Navigation links","Public page eligibility","Pages appear only when supported by the Site story, approved records or public-safe content channels; the template arranges them.","Page content and approved publishing sources determine availability","computed"),
  derived("Header call to action","Selected from currently available public pages and independently verified admissions or registration status; no enrollment permission is inferred from the template."),
  template("Decorative masthead language","Template-specific issue labels, motto strips, icons and ornaments. These are design copy, not sourced from Site Information or verified accreditation."),
  brand("Colors and typography","Applied from the selected Site Brand version. Changing the wireframe does not rewrite these values."),
  brand("Website logo and favicon","Only rights-reviewed current artwork is eligible for published output; a template illustration is never a Site logo."),
  field("Footer name and organization","Saved Site and Organization/Brand names","Renders those values exactly as stored, followed by CAN's platform attribution.","Establish → Site Profile / Website & Brand → Brand Identity","site-identity"),
];

const sections: Record<keyof PublicSiteHomeSections,WebsiteSectionSource>={
  hero:{
    key:"hero",title:"Welcome / hero",description:"First screen: headline, supporting text, image, navigation action and design-specific decorations.",
    appearsWhen:"Every homepage; missing optional images use a template illustration or an empty illustration slot.",
    elements:[
      authored("Main heading (H1)","heroHeadline","Uses the saved headline when provided; otherwise uses the exact Site Brand display name."),
      authored("Subheading","welcomeMessage","Saved welcome message, when provided."),
      brand("Name above the headline","When a custom headline is present, the exact saved Site Brand display name appears as the kicker."),
      template("Introductory paragraph","Renderer-supplied introduction tailored to available approved academic Programs and enrollment status. A synthetic template gallery may display fictional sample copy."),
      field("Hero image and alt text","Saved website artwork or Site media library","Uses rights-cleared Site hero artwork first, then approved Site media or a clearly illustrative template image in preview.","Establish → Website & Brand → Visual Identity → Imagery; Site media folder","site-media"),
      derived("Buttons and text links","Built from eligible public page routes, published opportunities and independently authorized inquiry destinations. No direct enrollment link without an approved release."),
      template("Template artwork and ornaments","Static folio, stamp, side note, cover label, tile or mosaic text specific to the selected wireframe."),
    ],
  },
  vision:{
    key:"vision",title:"Vision feature",description:"A prominent vision statement with editorial accent, section label and supporting paragraph.",
    appearsWhen:"The Site has a nonempty website vision field.",
    elements:[
      template("Eyebrow and H2","The renderer supplies the label 'Our vision' and the fixed display heading; the template changes their placement."),
      authored("Body paragraph","schoolVision","Uses the Site's saved editable vision copy, possibly initially suggested from Establish → Site Information → Purpose & Story."),
      template("Decorative monogram or index","The selected layout provides its own visual marker."),
    ],
  },
  story:{
    key:"story",title:"Community story",description:"Introduction to the Site's identity, purpose and community, with a link to About.",
    appearsWhen:"Local website copy exists and the About page is available.",
    elements:[
      template("Section eyebrow and heading","Fixed community label and template heading; the heading varies slightly with school-oriented content."),
      authored("Story paragraph","localDescription","Uses Site story first; if blank, falls back to schoolVision, churchHistory or leadershipWelcome, in that order."),
      field("Initial source suggestions","Site Information → Purpose & Story","Optional suggested copy uses saved community needs, founding story, motivation, values and future vision. The final saved website draft is authoritative.","Establish → Site Information → Purpose & Story; then Website & Brand → Your Content","site-story"),
      derived("About link","Only shown when /about is an eligible website page."),
    ],
  },
  explore:{
    key:"explore",title:"Explore the experience",description:"A navigation grid directing families to the published, eligible pages of the Site.",
    appearsWhen:"At least two eligible linked destinations exist.",
    elements:[
      template("Eyebrow, H2 and introductory text","Fixed labels such as 'Explore the experience' and the parent-facing introduction."),
      derived("Link tiles, descriptions and order","Compiled from available Programs, Courses, Classes, Academics, Student Life, Admissions and School Day pages. Missing/unapproved pages are not linked."),
      template("Tile numbers and arrows","Illustrative numbering and navigation symbols are layout elements."),
    ],
  },
  academics:{
    key:"academics",title:"Academic pathways",description:"Cards describing publicly authorized academic Programs.",
    appearsWhen:"Approved academic Program data is available and this placement is not replaced by an eligible learning.academics content channel. Fictional gallery samples are not real Programs.",
    elements:[
      template("Section label and H2","Renderer-owned academic pathway heading and supporting introduction."),
      approved("Program card names, summaries and delivery","Approved Site academic Program versions","Includes only approved public descriptions and permissible delivery information; cards do not inherit broad Establish-stage intent."),
      derived("Program inquiry and application actions","Application status comes from verified application permissions; an approved Program is not necessarily open for admission."),
      sourceLayout("Section placement or replacement","An eligible learning.academics block can supply Site-configured section headings and card layouts instead of this automatic block."),
    ],
  },
  enrichment:{
    key:"enrichment",title:"Student life / enrichment",description:"Cards for independently published enrichment activities and community programs.",
    appearsWhen:"Published enrichment records exist, an eligible channel supplies the section, or the sample template is illustrating a layout.",
    elements:[
      template("Eyebrow and section heading","Renderer supplies student-experience wording where no Site content channel replaces it."),
      approved("Activity cards, dates, season and fees","Approved enrichment catalog and public Offering data","Reads current authorized records, fees, capacity status and registration windows; no synthetic event is published from a template."),
      sourceLayout("Edited section title, description and layout","Site-configured learning.enrichment channels can replace the renderer's default panel."),
      derived("Availability messages","Comes from the published Offering's live registration terms, not manually entered template text."),
    ],
  },
  closing:{
    key:"closing",title:"Closing invitation",description:"Final editorial encouragement and next step.",
    appearsWhen:"There is applicable sample/design copy or approved academic Program content.",
    elements:[
      template("Eyebrow, H2 and supporting text","Fixed copy that varies by illustrative/sample mode and presence of approved academic records."),
      derived("Next-step button","Links to an eligible school/program page. Templates do not manufacture an admission or enrollment release."),
    ],
  },
  contact:{
    key:"contact",title:"Contact information",description:"Reviewed contact details and location for families.",
    appearsWhen:"At least one independently reviewed Site contact or address field is permitted for public display.",
    elements:[
      template("Section eyebrow and H2","Renderer-owned headings for contact information."),
      approved("Contact name, email, phone or office","Site contact · public identity review","Private Site Profile contact fields are not automatically exposed. Only explicitly reviewed public contact projections are eligible."),
      approved("Physical location","Site address · public identity review","A saved planning address alone does not establish visit availability or operating permission."),
      template("Location note","A published address is not proof the Site is open for visits."),
    ],
  },
  channelsLearning:{
    key:"channelsLearning",title:"Learning content blocks",description:"Site-authored section structure with data-backed listings for Programs, Courses, Classes and learning opportunities.",
    appearsWhen:"A configured, eligible Site content block with placement 'learning' has source records.",
    elements:[
      sourceLayout("Eyebrow, H2, description, layout and placement","From the saved websiteContentChannels block configuration; these are edited in the existing section editor."),
      approved("Cards and actual offers","Approved Program, Course, Class and enrollment catalog sources","Records and registration links are independently filtered by authorization and release state."),
      derived("Availability and actions","The shared Site enrollment-opportunity projection alone determines allowed actions."),
    ],
  },
  channelsCommunity:{
    key:"channelsCommunity",title:"Community content blocks",description:"Optional site-configured storytelling and community cards.",
    appearsWhen:"An enabled content block has placement 'community' and qualifying data.",
    elements:[
      sourceLayout("Eyebrow, H2, description and layout","Saved Site content-channel configuration determines headings and presentation."),
      approved("Cards or records","Channel-specific approved public sources","Never reads private Site setup, draft affiliation, student data or unapproved media directly into public content."),
    ],
  },
  channelsClosing:{
    key:"channelsClosing",title:"Closing content blocks",description:"Optional final Site-configured sections following the primary content.",
    appearsWhen:"An enabled content block has placement 'closing' and qualifying data.",
    elements:[
      sourceLayout("Eyebrow, H2, description and layout","Saved Site content-channel configuration determines structure."),
      approved("Published cards and actions","Approved Site catalog sources","Any contact, program or enrollment link is independently verified."),
    ],
  },
};

export const websiteTemplatePresentationNotes:Record<SiteTemplateId,{
  layout:string;chrome:string;hero:string;
}>={
  heritage:{
    layout:"Editorial school prospectus: hero; Vision and Story side by side; then exploration, academic and community sections.",
    chrome:"Issue-style masthead, folio numbering and crest-shaped initials are fixed layout decorations.",
    hero:"Folio strip and anchored photo occupy a wide editorial spread; the text fields still come from the one Site content document.",
  },
  community:{
    layout:"People-first sequence: hero; Story, enrichment and community; then vision, exploration and learning.",
    chrome:"Welcome announcement and community emblem are fixed template artwork, not a denomination or Site accreditation claim.",
    hero:"The open-door stamp, polaroid photo framing and 'A PLACE TO BELONG' tile are built-in design text.",
  },
  modern:{
    layout:"Information-first sequence: hero; academic pathways and learning blocks; then story, community and the closing invitation.",
    chrome:"Left-side navigation rail and 'EXPLORE LEARNING' wording are template chrome driven by the Site's public-content profile.",
    hero:"The discovery and community tiles contain fixed template labels; they are not claims of an approved Course.",
  },
  "bright-futures":{
    layout:"Family-first sequence: hero; exploration, activities and community; then academic pathways, vision and story.",
    chrome:"Open, family-friendly navigation and color treatments are structural design decisions.",
    hero:"The decorative spark and 'BE YOU!' sticker are fixed visual copy.",
  },
  summit:{
    layout:"Cinematic sequence: cover hero; prominent vision manifesto; then academics, story, experiences and exploration.",
    chrome:"The side spine and aspirational motto are fixed design elements.",
    hero:"Full-width photography and static 'DISCOVER' index framing surround the shared hero fields.",
  },
  classic:{
    layout:"Traditional collegiate layout: institutional masthead, hero, academic pillars and vision, followed by story and community.",
    chrome:"The heritage utility slogan and crest ornament are fixed template text, not independently verified institutional identity.",
    hero:"Classic emblem and centered composition surround the saved Site headline, welcome and approved image.",
  },
  campus:{
    layout:"Photo-journal sequence: hero mosaic; story, experiences and community; then vision, academics and closing.",
    chrome:"Journal subtitle and campus header arrangement are fixed design language.",
    hero:"Photo mosaic captions and secondary captions are fixed layout text; the photos come from rights-reviewed Site media or illustrative template samples.",
  },
};

const homeKeys=Object.keys(sections) as (keyof PublicSiteHomeSections)[];
function orderedHomepageKeys(template:SiteTemplateId):(keyof PublicSiteHomeSections)[]{
  // Compose the real public-home layout using safe sentinel strings. The
  // resulting sequence, not a duplicate layout list, drives the provenance UI.
  const snippets=Object.fromEntries(homeKeys.map(key=>[key,`__can_site_section_${key}__`]))
    as PublicSiteHomeSections;
  const html=composePublicSiteHome(template,snippets);
  return [...homeKeys].sort((a,b)=>
    html.indexOf(snippets[a])-html.indexOf(snippets[b]));
}
export function websiteTemplateHomeSources(template:SiteTemplateId):WebsiteSectionSource[]{
  return orderedHomepageKeys(template).map(key=>sections[key]);
}

const interior:Partial<Record<PublicSitePath,WebsiteSectionSource[]>>={
  "/about":[{
    key:"about-story",title:"About / Site story",description:"Editorial Site introduction, local story and eligible people/media.",
    appearsWhen:"The About page is eligible from saved Site copy or independently verified public information.",
    elements:[
      template("Page eyebrow, H1 and introductory paragraph","Renderer-owned About-page copy; some sample wording is intentionally fictional."),
      authored("Site story and vision","localDescription / churchHistory / schoolVision","Published Site-owned copy, optionally first suggested from Purpose & Story."),
      approved("People, leader photos and portraits","Reviewed Site parent information and approved Site media","A Site's private staff and contact roster are never copied into a public page by the template."),
    ],
  }],
  "/academics":[{
    key:"academics-page",title:"Academics / Program details",description:"Eligible academic pathways, delivery models and academic-related content sections.",
    appearsWhen:"The Academics page is eligible based on the reviewed academic catalog or sample layout.",
    elements:[
      template("Page eyebrow, H1 and introduction","Fixed renderer wording adapted to the academic-content profile."),
      approved("Academic cards, grades and delivery","Approved academic Programs and published schedules","Each Program's independently approved details, not Site intent, establish claims."),
      sourceLayout("Supplementary academic sections","Eligible /academics website content blocks use their own headings and layout."),
      derived("Inquiry and application links","Shown only when reviewed and permitted by the current academic enrollment workflow."),
    ],
  }],
  "/programs":[{
    key:"programs-page",title:"Programs / Published directory",description:"Program listings and any Site-authored introductory content blocks.",
    appearsWhen:"A public Program page is eligible or a private gallery illustrates the structure.",
    elements:[
      template("Page eyebrow, H1 and introduction","Fixed 'Community programs' framing; separate from a Program's authored description."),
      sourceLayout("Custom section headings and layout","Site-owned /programs channel blocks may override the automatic directory layout."),
      approved("Program titles, descriptions and statuses","Published public Program directory","Cards come from independently authorized public records."),
      derived("Registration buttons","Only an approved publication and enrollment release can yield an actionable registration link."),
    ],
  }],
  "/courses":[{
    key:"courses-page",title:"Courses / Published directory",description:"Public independent Course listings and availability.",
    appearsWhen:"A Course listing is eligible or the private template gallery shows an illustrative page.",
    elements:[
      template("Page eyebrow, H1 and introduction","Fixed 'Independent learning' copy."),
      sourceLayout("Custom section headings and layout","Site-owned /courses content blocks."),
      approved("Course cards and descriptions","Published Course records and noncredit enrollment releases","Only public-approved Courses with the required release are listed as registerable."),
      derived("Registration and waitlist actions","Authorized exact Course/Offering release, rechecked on enrollment."),
    ],
  }],
  "/classes":[{
    key:"classes-page",title:"Classes / Sessions directory",description:"Scheduled or facilitated Classes backed by published Courses.",
    appearsWhen:"Public Class discovery is authorized, or a template gallery demonstrates page layout.",
    elements:[
      template("Page eyebrow, H1 and introduction","Fixed 'Learn together' and Class directory intro wording."),
      sourceLayout("Custom section headings and layout","Site-owned /classes content blocks."),
      approved("Class cards and start times","Active published canonical Classes and course adoption","Only eligible public Classes, Sessions and permitted schedules appear."),
      derived("Join or enroll action","Canonical enrollment eligibility, not the presence of a Class card."),
    ],
  }],
  "/student-life":[{
    key:"student-life-page",title:"Student life / Activities",description:"Experiences beyond academic lessons.",
    appearsWhen:"Eligible enrichment offerings, published activities or an illustrative template is available.",
    elements:[
      template("Page heading and introductory copy","Renderer-authored student-life text."),
      approved("Activities, seasons, fees and places","Reviewed enrichment catalog and Site media","Activity data is source-owned; illustrative photo slots are not evidence of a real event."),
      sourceLayout("Site-owned student-life sections","Additional approved /student-life content blocks."),
    ],
  }],
  "/school-day":[{
    key:"school-day-page",title:"School day / Delivery",description:"Descriptions of reviewed schedule and attendance arrangements.",
    appearsWhen:"A reviewed academic learning model is available or a private sample is being shown.",
    elements:[
      template("Page heading and introduction","Renderer-authored explanation, not a verified operating schedule."),
      approved("Timetables and delivery details","Independently reviewed Program schedule and attendance information","Saved Site timezone and planning intent are not substituted for a published timetable."),
    ],
  }],
  "/admissions":[{
    key:"admissions-page",title:"Admissions / Family next steps",description:"Published admissions eligibility and application paths.",
    appearsWhen:"Approved school admissions content is eligible; samples illustrate layout only.",
    elements:[
      template("Page heading and introduction","Fixed family-facing introduction."),
      approved("Admissions steps and eligibility","Reviewed admissions policies and active Program authorizations","Applications cannot be generated from an unapproved Program."),
      derived("Application action","Shown only when independently approved and currently open."),
    ],
  }],
  "/tuition":[{
    key:"tuition-page",title:"Tuition / Financial support",description:"Publicly reviewed tuition and assistance details.",
    appearsWhen:"Approved tuition or financial-aid statements exist or an illustrative layout is requested.",
    elements:[
      template("Page heading and explanatory text","Fixed introductory copy."),
      approved("Tuition, assistance and fees","Verified tuition/financial-aid projections","Private fee assumptions and possible ESA funding are not presented as official prices."),
    ],
  }],
  "/families":[{
    key:"families-page",title:"Family services",description:"Current eligible Site support resources and family information.",
    appearsWhen:"Reviewed service information or an illustrative template is available.",
    elements:[
      template("Page heading and introductory copy","Renderer-authored family partnership text."),
      approved("Services and support cards","Reviewed public family-service records","Only records authorized for family-facing publication are used."),
    ],
  }],
  "/faq":[{
    key:"faq-page",title:"Questions and answers",description:"Answers drawn from eligible admissions, programs and pricing sources.",
    appearsWhen:"Verified public information exists for the FAQ or the sample gallery illustrates the page.",
    elements:[
      template("Section heading and framing","Fixed 'Common questions' introduction."),
      approved("Answers about school services","Reviewed academic, tuition and admissions data","Only public-approved statements are used, not private draft assumptions."),
    ],
  }],
  "/contact":[{
    key:"contact-page",title:"Contact / Request information",description:"The Site's permitted public contact details and inquiry navigation.",
    appearsWhen:"Reviewed public contact records or illustrative content make this page eligible.",
    elements:[
      template("Page heading and introduction","Renderer-authored 'Get in touch' framing."),
      approved("Address, office and contact fields","Independently reviewed public Site contact/address projections","Site Profile alone is private and does not automatically publish personal contact information."),
      derived("Inquiry links and forms","Current allowed contact route and Site/program inquiry policy. A preview never submits a live application."),
    ],
  }],
};

export function websiteTemplatePageSources(template:SiteTemplateId,page:PublicSitePath):WebsiteSectionSource[]{
  return page==="/" ? websiteTemplateHomeSources(template) : interior[page]??[];
}
export const websiteTemplatePageSourcesComplete = publicSitePagePaths.every(path=>
  path==="/" || (interior[path]?.length??0)>0);

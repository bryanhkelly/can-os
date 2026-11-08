/**
 * Fictional school photography production briefs.
 * Developer-controlled only: generation never happens during page rendering.
 */
import type { SiteTemplateId } from "./site-theme";
import type { TemplatePhotographyRole } from "./template-sample-images";

export const templatePhotographyRoles = [
  "hero","story_01","story_02","program_01","program_02","program_03",
  "community_01","community_02","admissions",
  "portrait_01","portrait_02","portrait_03",
] as const satisfies readonly TemplatePhotographyRole[];

export const templatePhotographyStandards = [
  "Original fictional editorial school photography, never presented as actual enrolled students or facilities.",
  "Photorealistic documentary style, natural light, believable skin tones, authentic educational activities and environments.",
  "Thoughtful diversity in gender, ethnicity, race and background; age-appropriate middle and high school students unless specified.",
  "Unposed expressions, realistic anatomy and hands, candid meaningful human interactions, premium independent school editorial quality.",
  "Clear visual focal point, sophisticated framing, natural depth, purposeful negative space for layout when relevant.",
  "No words, readable signs, logos, brand marks, watermarks, trademarked merchandise, artificial holograms or stock-photo posing.",
  "Exactly one distinct photograph. Not a contact sheet, collage, grid or composite of scenes.",
].join(" ");

type Direction = {identity:string; scenes:Readonly<Record<TemplatePhotographyRole,string>>};
const commonScenes:Readonly<Record<TemplatePhotographyRole,string>> = {
  hero:"Wide signature school scene with intentional headline-safe negative space, a compelling human focal point and layered environmental storytelling.",
  story_01:"A candid intimate moment of mentorship, listening and intellectual encouragement.",
  story_02:"Authentic student experience in a second environmental context with a different camera angle and mood.",
  program_01:"Meaningful humanities discussion or collaborative reading with genuine participation.",
  program_02:"Plausible hands-on STEM, science or engineering exploration with realistic materials.",
  program_03:"Purposeful creative work such as arts, writing or design in action.",
  community_01:"Students collaborating in a school community activity, naturally photographed.",
  community_02:"Spontaneous student friendship or authentic group interaction outside formal instruction.",
  admissions:"A welcoming, believable family conversation with an educator or school representative.",
  portrait_01:"Candid environmental portrait of a thoughtful student, composed vertically.",
  portrait_02:"Warm, grounded environmental portrait of an educator, composed vertically.",
  portrait_03:"Intimate vertically composed human-centered detail capturing a student's curiosity.",
};
const variants:Readonly<Record<SiteTemplateId,Direction>> = {
  heritage:{identity:"Heritage Academy: timeless academic prestige, stately architecture, rich oak libraries, scholarly discussion, warm window light, elegant navy-and-gold mood; editorial and restrained.",
    scenes:{...commonScenes,hero:"Diverse teens deeply engaged in discussion in an elegant library with grand architectural proportions; natural window light and copy-safe space."}},
  community:{identity:"Community & Faith: sincere belonging, diverse students in warm church-hosted learning spaces, compassionate adults, neighborhood connection, golden natural light and unforced documentary storytelling; no forced religious staging.",
    scenes:{...commonScenes,hero:"Genuine welcoming community learning moment in a sunlit church-hosted classroom with diverse teens collaborating and enjoying each other's company."}},
  modern:{identity:"Modern Learning: ambitious teens in contemporary glass learning studios, realistic technology, engineering, creative work, cool-neutral tones, decisive geometries and directional light; no implausible devices.",
    scenes:{...commonScenes,hero:"Cinematic modern design and engineering studio, authentic technology and students collaborating; strong architecture and headline-safe space."}},
  "bright-futures":{identity:"Bright Futures: inclusive upper-elementary and middle-school learners, expressive curiosity, bright daylight, lively sophisticated color accents, authentic age-appropriate creative learning.",
    scenes:{...commonScenes,hero:"Joyful but unstaged hands-on creative learning with younger students in a bright, colorful classroom; headline-safe negative space."}},
  summit:{identity:"Summit Preparatory: cinematic aspiration and independent achievement, believable dramatic school architecture, broad outdoor perspectives and golden-hour natural light; avoid risky activities.",
    scenes:{...commonScenes,hero:"Small group of teenagers walking through expansive campus architecture at golden hour, natural student conversation, striking perspective and room for large typography."}},
  classic:{identity:"Heritage Classical: intellectually disciplined classical liberal arts, great books, Socratic discussion, rhetoric, architecture with warm oak, stone and refined symmetry; different identity from Heritage Academy.",
    scenes:{...commonScenes,hero:"Great-books Socratic seminar in a beautifully symmetrical classical library with authentic diverse students and warm natural light."}},
  campus:{identity:"Campus Life: energetic candid school photojournalism, student voice, spontaneous friendships, layered environmental compositions, movement and authentic culture; avoid posed admissions photography.",
    scenes:{...commonScenes,hero:"Candid lively campus walkway: diverse teenagers in natural conversation with layered school architecture and energetic documentary movement."}},
};

export function photographyDimensions(role:TemplatePhotographyRole):{aspect_ratio:"16:9"|"3:2"|"4:3"|"4:5";minimum:{width:number;height:number}} {
  if(role==="hero")return {aspect_ratio:"16:9",minimum:{width:3840,height:2160}};
  if(role.startsWith("portrait"))return {aspect_ratio:"4:5",minimum:{width:1600,height:2000}};
  if(role.startsWith("story")||role==="admissions")return {aspect_ratio:"3:2",minimum:{width:2400,height:1600}};
  return {aspect_ratio:"4:3",minimum:{width:2400,height:1800}};
}

export function schoolPhotographyBrief(template:SiteTemplateId,role:TemplatePhotographyRole):{
  template:SiteTemplateId; role:TemplatePhotographyRole; prompt:string;
  aspect_ratio:"16:9"|"3:2"|"4:3"|"4:5"; minimum:{width:number;height:number};
  filename:string; batch:1|2;
} {
  const ordinal=templatePhotographyRoles.indexOf(role);
  if(ordinal<0)throw new Error("Unknown photography role");
  const dimensions=photographyDimensions(role);
  return {
    template,role,...dimensions,
    filename:`${template}/${role}.jpg`,
    batch:ordinal<6?1:2,
    prompt:`${variants[template].identity} Scene: ${variants[template].scenes[role]} ${templatePhotographyStandards} Requested presentation ratio ${dimensions.aspect_ratio}, minimum delivered size ${dimensions.minimum.width}x${dimensions.minimum.height}. One image only; no text or lettering. Maintain distinct identity from other shots.`,
  };
}

export function schoolPhotographyBatch(template:SiteTemplateId,batch:1|2) {
  return templatePhotographyRoles.slice(batch===1?0:6,batch===1?6:12)
    .map(role=>schoolPhotographyBrief(template,role));
}

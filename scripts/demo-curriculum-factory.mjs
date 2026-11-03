#!/usr/bin/env node
/**
 * Deterministic, original demo curriculum catalog. No external copyrighted
 * text, credentials, student records, publication or adoption is involved.
 *
 * Usage:
 *   node scripts/demo-curriculum-factory.mjs --output /tmp/can-demo-catalog.json
 *   node scripts/demo-curriculum-factory.mjs --output /tmp/can-demo-catalog.json --deep 15
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const subjects = [
  ["MAT","Mathematics",["Math Foundations","Pre-Algebra","Algebra I","Geometry","Algebra II","Statistics","Precalculus","Consumer Math","Financial Algebra","Mathematical Modeling","Discrete Mathematics","Problem Solving","Math Lab","Data Literacy","Quantitative Reasoning","Applied Mathematics","Calculus Preview","Math Enrichment"]],
  ["SCI","Science",["Earth Science","Life Science","Physical Science","Biology","Chemistry","Physics","Environmental Science","Anatomy and Physiology","Astronomy","Marine Science","Forensic Science","Ecology","Scientific Inquiry","STEM Lab","Health Science","Meteorology","Geology","Research Methods"]],
  ["ELA","English and Literature",["Reading Foundations","Literary Analysis","Composition","English 9","English 10","American Literature","World Literature","British Literature","Creative Writing","Journalism","Public Speaking","Rhetoric","Research Writing","Poetry","Media Literacy","Debate","Contemporary Fiction","Writing Workshop"]],
  ["HIS","History and Social Studies",["Ancient Civilizations","World Geography","US History","World History","Civics","Economics","Government","African American History","Church History","Texas History","California History","Comparative Cultures","Constitutional Studies","Global Issues","Local History","Historical Research","Leadership History","History of Science"]],
  ["BIB","Bible and Theology",["Old Testament Survey","New Testament Survey","Biblical Literacy","Christian Ethics","Life of Christ","Bible Study Methods","Wisdom Literature","Acts and Early Church","Faith and Society","World Religions","Christian Leadership","Service Learning"]],
  ["LAN","World Languages",["Spanish I","Spanish II","Spanish III","French I","French II","Mandarin I","Mandarin II","American Sign Language I","American Sign Language II","Arabic I","Latin Foundations","Language and Culture"]],
  ["ART","Arts and Electives",["Visual Art","Digital Photography","Music Appreciation","Creative Filmmaking","Theater","Graphic Design","Yearbook","Digital Media","Entrepreneurship","Computer Science","Web Design","Culinary Arts"]],
  ["ENR","Enrichment and Career",["Physical Education","Wellness","First Aid Foundations","Career Exploration","College Readiness","Personal Finance","Outdoor Education","Community Service","Leadership Lab","Robotics","Study Skills","Life Skills"]],
];

const deepCountArg = process.argv.indexOf("--deep");
const deepCount = deepCountArg === -1 ? 15 : Number(process.argv[deepCountArg + 1]);
if (!Number.isSafeInteger(deepCount) || deepCount < 0 || deepCount > 120) throw Error("--deep must be between 0 and 120");
const outputArg = process.argv.indexOf("--output");
if (outputArg === -1 || !process.argv[outputArg+1] || process.argv[outputArg+1].startsWith("--")) throw Error("Provide --output <path>");
const output = resolve(process.argv[outputArg+1]);
const featuredTitles = new Set(["Algebra I","Geometry","Statistics","Biology","Chemistry","Anatomy and Physiology","English 9","American Literature","US History","Civics","New Testament Survey","Spanish I","Computer Science","Physical Education","Robotics"]);
const courses = subjects.flatMap(([prefix, subject, titles]) => titles.map((title, i) => ({
  code: `CAN-DEMO-${prefix}-${String(i+1).padStart(2,"0")}`,
  title, subject, description: `Demonstration course for ${title}. Not approved for academic credit or use as instructional curriculum.`,
})));
if (courses.length !== 120 || new Set(courses.map(c => c.code)).size !== 120) throw Error("Catalog count/code mismatch");

function deepLesson(course, week, day) {
  const prefix = `${course.code.toLowerCase().replace(/[^a-z0-9]/g,"-")}-w${week}-d${day}`;
  const focus = `${course.title}: unit ${week}, lesson ${day}`;
  return {
    id: prefix, title: focus,
    body: `Demo lesson: explore a foundational idea in ${course.title}. Read the goal, discuss a real-world example, practice an explanation, then reflect on what you learned. This is synthetic demonstration content, not a vetted academic lesson.`,
    resources: [], learningTargets: [`Explain one foundational concept related to ${course.title} using your own words.`],
    estimatedMinutes: 45,
    activities: [
      {id:`${prefix}-launch`,kind:"launch",title:"Connect",instructions:`Write down something you already know about ${course.title}, then share one question you want answered.`,estimatedMinutes:5},
      {id:`${prefix}-instruction`,kind:"instruction",title:"Explore",instructions:`Review the lesson introduction for ${focus}. Identify an important term, question, or example.`,estimatedMinutes:15},
      {id:`${prefix}-guided`,kind:"guided_practice",title:"Practice together",instructions:`Work with a partner to explain one example related to ${course.title}; compare the reasoning you each used.`,estimatedMinutes:10},
      {id:`${prefix}-independent`,kind:"independent_practice",title:"Independent response",instructions:`Write a short response explaining one new concept from this lesson and how it might apply to everyday life.`,estimatedMinutes:10,evidence:"practice"},
      {id:`${prefix}-exit`,kind:"exit_ticket",title:"Exit ticket",instructions:"State one thing you learned and one question you still have.",estimatedMinutes:5,evidence:"formative"},
    ],
  };
}
function buildContent(course, deep) {
  const modules = deep ? Array.from({length:4}, (_,i) => {
    const week = i+1;
    return {id:`unit-${week}`,title:`Unit ${week}: ${course.title} exploration`,lessons:Array.from({length:5},(_,j)=>deepLesson(course,week,j+1))};
  }) : [{id:"overview",title:"Course preview",lessons:[{
    id:"welcome", title:`Welcome to ${course.title}`,
    body:`This preview introduces the ${course.title} demo course. Full instructional content has not been authored, reviewed, or approved. Explore the school workflow using this illustrative lesson.`,
    resources:[],
  }]}];
  return {version:1,syllabus:`${course.title} | CAN OS DEMO | Synthetic material. For product demonstrations only; not credit-ready. ${deep ? "Contains four illustrative weeks and twenty demonstration lessons." : "Contains one preview lesson."}`,modules,resources:[]};
}
const payload = {
  format:"can-os-demo-catalog-v1",
  licenseCode:"LicenseRef-CAN-Original-Demo",
  provenance:{sourceType:"ai-assisted-original-demo",isSynthetic:true,creditStatus:"not_credit_ready",reviewStatus:"unreviewed",adoptionAuthorized:false},
  pack:{slug:"can-os-demo-catalog",name:"CAN OS Demonstration Catalog",description:"Synthetic course catalog for exploring school software; not approved curriculum.",visibility:"private"},
  courses:courses.map((course,i)=>{const featured=featuredTitles.has(course.title);const featuredIndex=courses.filter(c=>featuredTitles.has(c.title)).findIndex(c=>c.code===course.code);const deep=featured ? featuredIndex<deepCount : i<Math.max(0,deepCount-featuredTitles.size);return {...course,deepDemo:deep,learning:buildContent(course,deep)};}),
};
mkdirSync(dirname(output),{recursive:true});
writeFileSync(output,JSON.stringify(payload,null,2)+"\n");
console.log(JSON.stringify({output,courses:payload.courses.length,deepCourses:payload.courses.filter(c=>c.deepDemo).length,lessons:payload.courses.reduce((n,c)=>n+c.learning.modules.reduce((m,u)=>m+u.lessons.length,0),0)},null,2));

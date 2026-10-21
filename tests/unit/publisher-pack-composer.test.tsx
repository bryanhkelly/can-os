import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PublisherPackComposer } from "@/components/learning/PublisherPackComposer";

vi.mock("@/modules/learning/publisher-pack-authoring.functions",()=>({
  getPublisherPackStudio:vi.fn(),createAuthoredPublisherPack:vi.fn(),
  startPublisherPackDraft:vi.fn(),saveAuthoredPublisherPack:vi.fn(),
  publishAuthoredPublisherPack:vi.fn(),
}));

describe("publisher curriculum pack composer",()=>{
 it("exposes pack publishing in the existing curriculum studio workflow",()=>{
  const publishedCourse={
   courseId:"course-1",courseVersionId:"course-v1",title:"Algebra I",
   code:"CAN-ALG1",subject:"Mathematics",version:1,
  };
  const release={
   id:"pack-v1",version:1,status:"draft",courseVersionIds:[],
   revision:"a".repeat(64),publishedAt:null,
  };
  const studio={
   programId:"program-1",courses:[publishedCourse],
   packs:[{id:"pack-1",name:"High School Core",slug:"hs-core",
    description:"Publisher-authored complete high school courses",visibility:"public",
    licenseCode:"COMMERCIAL",releases:[release]}],
  };
  const html=renderToStaticMarkup(<PublisherPackComposer studio={studio} onSaved={async()=>{}}/>);
  for(const expected of [
   "Publisher Packs","Create curriculum pack","Publisher description","Commercial",
   "Publisher pack draft composer","Published courses for this pack","CAN-ALG1",
   "Save course selection","Publish pack release","Publication reason",
   "existing school adoptions",
  ])expect(html).toContain(expected);
  expect(html).toContain("verified agreements");
  expect(html).toContain("disabled");
 });
 it("shows an empty publisher library without exposing a non-existent release",()=>{
  const html=renderToStaticMarkup(<PublisherPackComposer
    studio={{programId:"program-1",courses:[],packs:[]}} onSaved={async()=>{}}/>);
  expect(html).toContain("No publisher packs have been created");
  expect(html).not.toContain("Publish pack release");
 });
});

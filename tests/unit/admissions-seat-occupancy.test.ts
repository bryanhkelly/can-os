import {describe,expect,it} from "vitest";
import {calculateSeatOccupancy} from "@/domain/admissions-seat-occupancy";
const now=new Date("2027-01-15T12:00:00Z");
const future=new Date("2027-02-01T12:00:00Z");
const past=new Date("2027-01-01T12:00:00Z");
describe("household admissions seat accounting",()=>{
 it("holds two separate seats for siblings under the same guardian",()=>{
  expect(calculateSeatOccupancy([],[
   {studentId:"sibling-one",status:"issued",expiresAt:future},
   {studentId:"sibling-two",status:"accepted",expiresAt:future},
  ],now)).toBe(2);
 });
 it("does not count an active enrollment and accepted offer twice",()=>{
  expect(calculateSeatOccupancy([{studentId:"sibling-one"}],[
   {studentId:"sibling-one",status:"accepted",expiresAt:future},
   {studentId:"sibling-two",status:"issued",expiresAt:future},
  ],now)).toBe(2);
 });
 it("frees seats for expired, declined, or withdrawn offers",()=>{
  expect(calculateSeatOccupancy([],[
   {studentId:"a",status:"issued",expiresAt:past},
   {studentId:"b",status:"declined",expiresAt:future},
   {studentId:"c",status:"withdrawn",expiresAt:null},
   {studentId:"d",status:"issued",expiresAt:future},
  ],now)).toBe(1);
 });
 it("counts multiple offers for the same student only once",()=>{
  expect(calculateSeatOccupancy([],[
   {studentId:"a",status:"issued",expiresAt:future},
   {studentId:"a",status:"accepted",expiresAt:future},
  ],now)).toBe(1);
 });
 it("counts an issued offer expiring exactly now as no longer reserved",()=>{
  expect(calculateSeatOccupancy([],[{studentId:"a",status:"issued",expiresAt:now}],now)).toBe(0);
 });
 it("holds offers with no expiration while they remain issued",()=>{
  expect(calculateSeatOccupancy([],[{studentId:"a",status:"issued",expiresAt:null}],now)).toBe(1);
 });
});

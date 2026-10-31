import { isLaunchOpeningDate } from "./launch-opening-date";

/** Editable planning defaults, independent of grades, credit or opening authority. */
export function schoolYearStructure(startsOn: string, endsOn: string, structure: "full_year" | "semesters") {
  if (!isLaunchOpeningDate(startsOn) || !isLaunchOpeningDate(endsOn) || startsOn > endsOn)
    throw new Error("Choose a valid school-year date range");
  if (structure === "full_year") return [
    {key:"full-year",name:"Full-year term",sequence:1,startsOn,endsOn},
  ];
  const start = Date.parse(startsOn + "T00:00:00Z");
  const days = Math.round((Date.parse(endsOn + "T00:00:00Z") - start) / 86_400_000) + 1;
  if (days < 2) throw new Error("Two semesters need at least two calendar days");
  const secondStart = start + Math.ceil(days / 2) * 86_400_000;
  return [
    {key:"semester-1",name:"First semester",sequence:1,startsOn,
      endsOn:new Date(secondStart - 86_400_000).toISOString().slice(0,10)},
    {key:"semester-2",name:"Second semester",sequence:2,
      startsOn:new Date(secondStart).toISOString().slice(0,10),endsOn},
  ];
}

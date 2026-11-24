export type GoResponseKind="redirect"|"page";
export type GoResponseCounts={
  linkOpens:number;
  pageViews:number;
  redirectResponses:number;
};

/** Successful response counts only. A preview page selector denotes internal
 * navigation, even if it targets the homepage. Requests are not unique people. */
export function goResponseCounts(response:GoResponseKind,entry:boolean):GoResponseCounts {
  return {
    linkOpens:entry||response==="redirect"?1:0,
    pageViews:response==="page"?1:0,
    redirectResponses:response==="redirect"?1:0,
  };
}

/** A mixed historical entry count cannot establish its response classification. */
export function unclassifiedGoEntries(mixedEntries:number,classifiedEntries:number):number {
  return Math.max(0,mixedEntries-classifiedEntries);
}

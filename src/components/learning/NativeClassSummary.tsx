import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { RecordFacts, StatusBadge } from "@/components/workspace";

/** Shared, read-only view of one authorized native Class.
 * Parent components own their exact Site query and mutation permissions.
 * This component never fetches broader catalog data or grants Class access.
 */
export type NativeClassSummaryRecord={
  classId:string;
  title:string;
  state:string;
  deliveryMode:string;
  offeringState?:string|null;
  visibility?:string|null;
  versionNo?:number|null;
  enrollmentMethods?:readonly string[]|null;
};

export function NativeClassSummary({item,children}:{
  item:NativeClassSummaryRecord;
  children?:ReactNode;
}){
  return <article className="min-w-0 border border-border bg-card p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <h3 className="min-w-0 text-base font-semibold">
        <Link to="/class/$classId" params={{classId:item.classId}}
          search={{view:"manage",tab:"overview"}}
          className="underline-offset-2 hover:underline focus-visible:underline">
          {item.title}
        </Link>
      </h3>
      <StatusBadge tone={item.state==="active"?"success":"neutral"}>
        {item.state.replaceAll("_"," ")}
      </StatusBadge>
    </div>
    <RecordFacts columns={2} label={item.title+" Class details"} className="mt-3"
      items={[
        {label:"Delivery",value:item.deliveryMode.replaceAll("_"," ")},
        {label:"Class Offering",value:item.offeringState
          ?[item.visibility,item.offeringState,
            item.versionNo!=null?"v"+item.versionNo:null].filter(Boolean).join(" · ")
          :"Not created · internal Class"},
      ]}/>
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
      <Link to="/class/$classId" params={{classId:item.classId}}
        search={{view:"manage",tab:"overview"}}
        className="inline-flex min-h-10 items-center text-sm font-semibold text-primary underline underline-offset-4">
        Open Class workspace
      </Link>
      {children}
    </div>
  </article>;
}

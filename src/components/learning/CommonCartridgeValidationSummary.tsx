import type { validateCommonCartridgeImport } from "@/modules/learning/common-cartridge-import.functions";
type Report=Awaited<ReturnType<typeof validateCommonCartridgeImport>>;
export function CommonCartridgeValidationSummary({report}:{report:Report}) {
 return <div className="space-y-2 rounded-lg border p-4 text-sm" role="status">
  <p><strong>Validated source:</strong> {report.preview.profile.replaceAll("_"," ")} · {report.preview.resources.length} resources · {report.preview.outline.length} top-level units</p>
  <p><strong>Publication:</strong> Source inspection is separate from publishing. Only explicitly selected external web links can be attached to an existing Section. Embedded lessons, QTI and LTI are not converted.</p>
  <ul className="list-disc pl-5">{report.preview.notices.map((notice,index)=><li key={index}>{notice}</li>)}</ul>
  {!report.preview.notices.length&&<p>No unresolved resource references were detected in the manifest.</p>}
 </div>;
}

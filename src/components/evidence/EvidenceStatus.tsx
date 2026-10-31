import { StatusBadge } from "@/components/workspace";
export function EvidenceStatus({ status }: { status: string }) {
  const tone = status === "approved" ? "success" : status === "pending" ? "attention" : "danger";
  return <StatusBadge tone={tone}>{status}</StatusBadge>;
}

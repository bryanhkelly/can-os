import { StatusBadge } from "@/components/workspace";
export function EvidenceStatus({ status }: { status: string }) {
  const tone = status === "approved" ? "success" : status === "pending" ? "attention" :
    status === "rejected" || status === "expired" ? "danger" : "neutral";
  return <StatusBadge tone={tone}>{status}</StatusBadge>;
}

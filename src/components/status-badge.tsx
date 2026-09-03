import type { LeadStatus } from "@/outreach/models";

export function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span className="status-pill" data-status={status}>
      {status}
    </span>
  );
}

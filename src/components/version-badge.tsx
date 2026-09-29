// ============================================================
// VersionBadge – displays evaluator/rubric/taxonomy version
// ============================================================
import type { EvaluatorStatus } from "@/core/types";

const statusColors: Record<EvaluatorStatus, string> = {
  draft:      "bg-gray-100 text-gray-600 border-gray-300",
  candidate:  "bg-yellow-50 text-yellow-700 border-yellow-400",
  validated:  "bg-blue-50 text-blue-700 border-blue-400",
  active:     "bg-green-50 text-green-700 border-green-500",
  superseded: "bg-slate-100 text-slate-500 border-slate-300",
};

interface VersionBadgeProps {
  label: string;
  version: string;
  status?: EvaluatorStatus;
}

export function VersionBadge({ label, version, status }: VersionBadgeProps) {
  const colorClass = status ? statusColors[status] : "bg-gray-100 text-gray-700 border-gray-300";
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-slate-500 uppercase tracking-wide w-24 shrink-0">
        {label}
      </span>
      <span
        className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-mono font-semibold ${colorClass}`}
      >
        {version}
        {status && (
          <span className="ml-1 font-sans font-normal opacity-70">
            [{status}]
          </span>
        )}
      </span>
    </div>
  );
}

// ============================================================
// VersionBadge — kept for backward compat (used in mobile layout)
// Desktop layout uses InstrumentPlate directly.
// ============================================================
import type { EvaluatorStatus } from "@/core/types";

const STATUS_STYLES: Record<EvaluatorStatus, string> = {
  draft:      "text-jh-dim border-jh-border-lt",
  candidate:  "text-jh-amber border-jh-amber",
  validated:  "text-jh-green border-jh-green",
  active:     "text-jh-green border-jh-green font-bold",
  superseded: "text-jh-dim border-jh-border-lt line-through",
  rejected:   "text-jh-red border-jh-red",
};

interface Props {
  label: string;
  version: string;
  status?: EvaluatorStatus;
}

export function VersionBadge({ label, version, status }: Props) {
  const style = status ? STATUS_STYLES[status] : "text-jh-text border-jh-border-lt";
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-mono text-jh-dim uppercase tracking-wide w-20 shrink-0">
        {label}
      </span>
      <span className={`inline-flex items-center border px-1.5 py-0.5 text-[10px] font-mono ${style}`}>
        {version}
        {status && (
          <span className="ml-1.5 font-normal opacity-60 normal-case">
            [{status}]
          </span>
        )}
      </span>
    </div>
  );
}

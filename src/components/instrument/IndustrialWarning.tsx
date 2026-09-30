// ============================================================
// IndustrialWarning — factual measurement alert
//
// Used when a trigger fires and the operational state degrades.
// Language: dry, factual, technical. No SaaS idioms.
//
// Props:
//   title       — short alarm title (ALL CAPS preferred)
//   description — one sentence explanation
//   metric      — metric name, e.g. "FAIL Recall"
//   observed    — observed value string, e.g. "50.0%"
//   threshold   — threshold value string, e.g. "70.0%"
//   actionLabel — CTA text, e.g. "INVESTIGATE →"
//   actionHref  — CTA link
// ============================================================
import Link from "next/link";

interface Props {
  title: string;
  description?: string;
  metric: string;
  observed: string;
  threshold: string;
  actionLabel?: string;
  actionHref?: string;
}

export function IndustrialWarning({
  title,
  description,
  metric,
  observed,
  threshold,
  actionLabel = "INVESTIGATE →",
  actionHref = "/evidence",
}: Props) {
  return (
    <div
      className="border border-jh-border bg-jh-panel border-l-[3px] border-l-jh-red"
      role="alert"
    >
      {/* Title row */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-jh-border-lt">
        <span className="font-mono text-[10px] font-bold text-jh-red tracking-[0.12em]">
          ⚠ {title}
        </span>
      </div>

      {/* Body */}
      <div className="px-3 py-2 space-y-2">
        {description && (
          <p className="font-mono text-[10px] text-jh-dim leading-relaxed">
            {description}
          </p>
        )}

        {/* Measurement row */}
        <div className="flex items-baseline gap-4 font-mono text-[10px]">
          <div>
            <span className="text-jh-dim uppercase tracking-wide mr-2">{metric}</span>
          </div>
          <div className="flex gap-4">
            <span>
              <span className="text-jh-red font-bold text-sm tabular-nums">{observed}</span>
              <span className="text-jh-dim ml-1 text-[9px]">observed</span>
            </span>
            <span className="text-jh-dim">·</span>
            <span>
              <span className="text-jh-text font-semibold tabular-nums">{threshold}</span>
              <span className="text-jh-dim ml-1 text-[9px]">threshold</span>
            </span>
          </div>
        </div>

        {/* Action */}
        {actionHref && (
          <div className="pt-1">
            <Link
              href={actionHref}
              className="inline-block font-mono text-[11px] font-semibold border border-jh-red text-jh-red px-3 py-1.5 hover:bg-red-50/40 transition-colors"
            >
              {actionLabel}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

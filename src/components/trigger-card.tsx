// ============================================================
// TriggerRow — compact horizontal trigger display
// Uses <details>/<summary> for rationale expansion (no JS needed)
//
// Principle: a trigger is evidence to investigate,
// NOT evidence that the evaluator is wrong.
// ============================================================
import type { TriggerResult } from "@/core/types";
import { pct } from "@/core/metrics";

interface Props {
  result: TriggerResult;
}

export function TriggerCard({ result }: Props) {
  const { config, fired, observedValue, note } = result;

  const rowBg = fired ? "bg-red-50/60" : "";
  const statusLabel = fired ? "FIRED" : "OK";
  const statusColor = fired ? "text-jh-red" : "text-jh-green";
  const typeLabel = config.type === "metric" ? "METRIC" : "CHANGE";

  return (
    <details className={`border-b border-jh-border-lt last:border-b-0 ${rowBg}`}>
      <summary className="flex items-center gap-2 py-1.5 px-2 cursor-pointer select-none">
        {/* Status indicator */}
        <div
          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
            fired
              ? "bg-jh-led-red shadow-[0_0_4px_var(--jh-led-red)]"
              : "bg-jh-led-green"
          }`}
          aria-hidden="true"
        />

        {/* Status label */}
        <span className={`font-mono text-[10px] font-bold w-8 shrink-0 ${statusColor}`}>
          {statusLabel}
        </span>

        {/* Type */}
        <span className="font-mono text-[10px] text-jh-dim w-14 shrink-0">
          {typeLabel}
        </span>

        {/* ID */}
        <span className="font-mono text-[10px] text-jh-text flex-1 truncate">
          {config.id}
        </span>

        {/* Metric condition */}
        {config.type === "metric" && (
          <span className="font-mono text-[10px] text-jh-dim shrink-0">
            {config.metric}&nbsp;
            <span className="text-jh-border-mid">{config.operator}</span>
            &nbsp;{pct(config.threshold)}
          </span>
        )}

        {/* Observed value */}
        {observedValue !== undefined && (
          <span
            className={`font-mono text-[10px] font-semibold tabular-nums w-12 text-right shrink-0 ${
              fired ? "text-jh-red" : "text-jh-green"
            }`}
          >
            {pct(observedValue)}
          </span>
        )}

        {/* Expand chevron */}
        <span className="font-mono text-[10px] text-jh-dim ml-1 shrink-0">
          ›
        </span>
      </summary>

      {/* Expanded content */}
      <div className="px-5 pb-2 pt-0.5 space-y-1 border-t border-jh-border-lt bg-jh-bg/40">
        {note && (
          <p className="text-[10px] font-mono text-jh-dim leading-relaxed italic">
            {note}
          </p>
        )}
        {config.type === "change" && (
          <p className="text-[10px] font-mono text-jh-dim">
            event:&nbsp;<span className="text-jh-text">{config.event}</span>
          </p>
        )}
        <p className="text-[10px] text-jh-dim leading-relaxed border-t border-jh-border-lt pt-1 mt-1">
          <span className="font-semibold text-jh-dim">Rationale:</span>{" "}
          {config.rationale}
        </p>
      </div>
    </details>
  );
}

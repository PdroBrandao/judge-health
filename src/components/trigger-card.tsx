// ============================================================
// TriggerCard – displays a single trigger result
// ============================================================
import type { TriggerResult } from "@/core/types";
import { pct } from "@/core/metrics";

interface Props {
  result: TriggerResult;
}

export function TriggerCard({ result }: Props) {
  const { config, fired, observedValue, note } = result;

  const borderClass = fired
    ? "border-red-400 bg-red-50"
    : "border-green-300 bg-green-50";

  const badgeClass = fired
    ? "bg-red-600 text-white"
    : "bg-green-600 text-white";

  const typeLabel =
    config.type === "metric" ? "Metric Trigger" : "Change Trigger";

  return (
    <div className={`rounded-lg border-2 p-4 ${borderClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              {typeLabel}
            </span>
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded ${badgeClass}`}
            >
              {fired ? "FIRED" : "OK"}
            </span>
          </div>

          <div className="mt-1 font-mono text-sm font-semibold text-slate-800">
            {config.id}
          </div>

          {config.type === "metric" && (
            <div className="mt-1 text-sm text-slate-600">
              <span className="font-medium">{config.metric}</span>{" "}
              <span className="font-mono text-slate-500">
                {config.operator} {pct(config.threshold)}
              </span>
              {observedValue !== undefined && (
                <span className="ml-2 text-slate-700">
                  → observed:{" "}
                  <span
                    className={`font-semibold ${fired ? "text-red-700" : "text-green-700"}`}
                  >
                    {pct(observedValue)}
                  </span>
                </span>
              )}
            </div>
          )}

          {config.type === "change" && (
            <div className="mt-1 text-sm text-slate-600">
              event: <span className="font-mono">{config.event}</span>
            </div>
          )}

          {note && (
            <div className="mt-2 text-xs text-slate-500 italic leading-relaxed">
              {note}
            </div>
          )}

          <div className="mt-2 text-xs text-slate-400 border-t border-slate-200 pt-2">
            <span className="font-medium text-slate-500">Rationale:</span>{" "}
            {config.rationale}
          </div>
        </div>
      </div>
    </div>
  );
}

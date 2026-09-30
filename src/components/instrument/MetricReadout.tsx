// ============================================================
// MetricReadout — one row: label | value (CI)
// All numerical data in monospace, no decoration
// ============================================================

interface Props {
  label: string;
  value: string;
  ci?: string;
  subLabel?: string;
  alert?: boolean;
  muted?: boolean;
}

export function MetricReadout({ label, value, ci, subLabel, alert, muted }: Props) {
  return (
    <div
      className={`flex items-baseline justify-between py-1.5 px-2 border-b border-jh-border-lt last:border-b-0 ${
        alert ? "bg-red-50/70" : ""
      }`}
    >
      <div className="min-w-0 mr-3">
        <span className="text-[11px] font-mono text-jh-dim">{label}</span>
        {subLabel && (
          <span className="text-[10px] font-mono text-jh-border-mid ml-1">
            {subLabel}
          </span>
        )}
      </div>
      <div className="text-right flex-shrink-0">
        <span
          className={`font-mono font-semibold text-sm tabular-nums ${
            alert ? "text-jh-red" : muted ? "text-jh-dim" : "text-jh-text"
          }`}
        >
          {value}
          {alert && <span className="ml-0.5 text-xs">▼</span>}
        </span>
        {ci && (
          <span className="block text-[10px] font-mono text-jh-dim leading-none mt-0.5">
            {ci}
          </span>
        )}
      </div>
    </div>
  );
}

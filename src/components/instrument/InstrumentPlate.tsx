// ============================================================
// InstrumentPlate — physical equipment identification tag
//
// Appears as a small metal nameplate physically attached to
// the instrument chassis. Purpose: identity + traceability.
//
// Two usage modes:
//   1. Standard: pass `modelId`, `rev`, `serial` + optional `rows`
//   2. Compact: same but rendered smaller
//
// Design:
//   - jh-panel-deep border
//   - Slightly warm off-white background (#f0efe9)
//   - Bold model ID at top
//   - "MODEL  CALIBRATION INSTRUMENT" subtitle
//   - Separator line
//   - Compact label/value rows
// ============================================================

export interface PlateRow {
  label: string;
  value: string;
  status?: "ok" | "error" | "warning" | "dim";
}

interface Props {
  modelId?: string;
  rev?: string;
  serial?: string;
  rows?: PlateRow[];
  compact?: boolean;
}

const STATUS_CLASSES: Record<NonNullable<PlateRow["status"]>, string> = {
  ok:      "text-jh-green font-semibold",
  error:   "text-jh-red font-semibold",
  warning: "text-jh-amber font-semibold",
  dim:     "text-jh-dim",
};

export function InstrumentPlate({
  modelId = "JH-001",
  rev = "0.2",
  serial = "AACI-26-001",
  rows = [],
  compact = false,
}: Props) {
  return (
    <div
      className="jh-panel-deep font-mono inline-block"
      style={{ background: "#f0efe9", minWidth: compact ? 160 : 196 }}
    >
      {/* Header: model ID */}
      <div className="px-3 pt-2 pb-1">
        <div className={`font-bold text-jh-text tracking-wide ${compact ? "text-sm" : "text-base"}`}>
          {modelId}
        </div>
        <div className="text-[8px] text-jh-dim uppercase tracking-[0.18em] leading-tight mt-0.5">
          Model &nbsp; Calibration Instrument
        </div>
      </div>

      {/* Separator */}
      <div className="border-t border-jh-border-mid mx-2 mb-1" />

      {/* Fixed rows: REV + SERIAL */}
      <div className="px-3 pb-1 space-y-0.5 text-[10px]">
        <div className="flex gap-2 leading-[1.65]">
          <span className="text-jh-dim uppercase tracking-wide w-[52px] shrink-0">Rev</span>
          <span className="text-jh-text">{rev}</span>
        </div>
        <div className="flex gap-2 leading-[1.65]">
          <span className="text-jh-dim uppercase tracking-wide w-[52px] shrink-0">Serial</span>
          <span className="text-jh-text">{serial}</span>
        </div>

        {/* Optional dynamic rows */}
        {rows.length > 0 && (
          <div className="border-t border-jh-border-lt mt-1 pt-1 space-y-0.5">
            {rows.map((row, i) => (
              <div key={i} className="flex gap-2 leading-[1.65]">
                <span className="text-jh-dim uppercase tracking-wide w-[52px] shrink-0">
                  {row.label}
                </span>
                <span className={row.status ? STATUS_CLASSES[row.status] : "text-jh-text"}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

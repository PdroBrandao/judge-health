// ============================================================
// CalibrationSeal — evaluation state stamp
// Semantics: stamp represents the validaton state of the evaluator
// ============================================================

export type SealStatus =
  | "VALIDATED"
  | "DEGRADED"
  | "INVESTIGATING"
  | "REVALIDATION REQUIRED";

const SEAL_STYLES: Record<SealStatus, { border: string; text: string; rotate: string }> = {
  "VALIDATED":            { border: "border-jh-green",  text: "text-jh-green",  rotate: "" },
  "DEGRADED":             { border: "border-jh-red",    text: "text-jh-red",    rotate: "-rotate-1" },
  "INVESTIGATING":        { border: "border-jh-amber",  text: "text-jh-amber",  rotate: "rotate-1" },
  "REVALIDATION REQUIRED":{ border: "border-jh-red",    text: "text-jh-red",    rotate: "-rotate-1" },
};

interface Props {
  status: SealStatus;
  compact?: boolean;
}

export function CalibrationSeal({ status, compact = false }: Props) {
  const { border, text, rotate } = SEAL_STYLES[status];
  return (
    <div
      className={`inline-flex items-center border-2 transform ${border} ${rotate} ${compact ? "px-2 py-0.5" : "px-3 py-1"}`}
      role="status"
      aria-label={`Calibration status: ${status}`}
    >
      <span className={`font-mono font-bold tracking-[0.12em] uppercase ${text} ${compact ? "text-[10px]" : "text-xs"}`}>
        {status}
      </span>
    </div>
  );
}

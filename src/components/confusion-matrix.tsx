// ============================================================
// ConfusionMatrixDisplay — binary PASS/FAIL matrix
// Positive class = FAIL (minority / high-stakes)
// Engineering instrument aesthetic — thin lines, monospace
// ============================================================
import type { BinaryConfusionMatrix } from "@/core/types";

interface Props {
  matrix: BinaryConfusionMatrix;
}

export function ConfusionMatrixDisplay({ matrix }: Props) {
  const { TP, FP, TN, FN } = matrix;
  const total = TP + FP + TN + FN;

  return (
    <div>
      {/* Axis legend — PREDICTED */}
      <div className="grid grid-cols-[56px_1fr_1fr] mb-0.5">
        <div />
        <div className="text-center text-[10px] font-mono text-jh-dim py-0.5 border-b border-jh-border-lt">
          Predicted FAIL
        </div>
        <div className="text-center text-[10px] font-mono text-jh-dim py-0.5 border-b border-jh-border-lt">
          Predicted PASS
        </div>
      </div>

      {/* TRUTH FAIL row */}
      <div className="grid grid-cols-[56px_1fr_1fr] items-stretch">
        <div className="flex items-center justify-end pr-2">
          <span className="text-[10px] font-mono text-jh-dim [writing-mode:vertical-rl] rotate-180">
            Truth FAIL
          </span>
        </div>

        {/* TP */}
        <div className="border border-jh-border p-2 text-center">
          <div className="text-xl font-mono font-bold text-jh-text tabular-nums">{TP}</div>
          <div className="text-[10px] font-mono text-jh-green font-semibold mt-0.5">TP</div>
          <div className="text-[9px] text-jh-dim mt-0.5 leading-tight">Correct FAIL</div>
        </div>

        {/* FN — most dangerous cell */}
        <div className="border border-jh-border p-2 text-center border-l-0" style={{ background: "rgba(153,27,27,0.05)" }}>
          <div className="text-xl font-mono font-bold text-jh-red tabular-nums">{FN}</div>
          <div className="text-[10px] font-mono text-jh-red font-semibold mt-0.5">FN ←</div>
          <div className="text-[9px] text-jh-dim mt-0.5 leading-tight">Missed FAIL</div>
        </div>
      </div>

      {/* TRUTH PASS row */}
      <div className="grid grid-cols-[56px_1fr_1fr] items-stretch border-t-0">
        <div className="flex items-center justify-end pr-2">
          <span className="text-[10px] font-mono text-jh-dim [writing-mode:vertical-rl] rotate-180">
            Truth PASS
          </span>
        </div>

        {/* FP */}
        <div className="border border-jh-border border-t-0 p-2 text-center">
          <div className="text-xl font-mono font-bold text-jh-amber tabular-nums">{FP}</div>
          <div className="text-[10px] font-mono text-jh-amber font-semibold mt-0.5">FP</div>
          <div className="text-[9px] text-jh-dim mt-0.5 leading-tight">False Alarm</div>
        </div>

        {/* TN */}
        <div className="border border-jh-border border-t-0 border-l-0 p-2 text-center">
          <div className="text-xl font-mono font-bold text-jh-text tabular-nums">{TN}</div>
          <div className="text-[10px] font-mono text-jh-green font-semibold mt-0.5">TN</div>
          <div className="text-[9px] text-jh-dim mt-0.5 leading-tight">Correct PASS</div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-2 pt-2 border-t border-jh-border-lt text-[10px] font-mono text-jh-dim space-y-0.5">
        <div>n={total} · positive class = FAIL (minority / high-stakes)</div>
        <div>
          <span className="text-jh-red">FN = evaluator misses a FAIL</span>
          {" — "}high-stakes miss, primary concern
        </div>
      </div>
    </div>
  );
}

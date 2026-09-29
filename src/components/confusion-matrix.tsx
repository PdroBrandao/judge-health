// ============================================================
// ConfusionMatrixDisplay – binary PASS/FAIL matrix
// Positive class = FAIL (minority / high-stakes)
// ============================================================
import type { BinaryConfusionMatrix } from "@/core/types";

interface Props {
  matrix: BinaryConfusionMatrix;
}

interface Cell {
  label: string;
  value: number;
  colorClass: string;
  note?: string;
}

export function ConfusionMatrixDisplay({ matrix }: Props) {
  const { TP, FP, TN, FN } = matrix;

  const cells: Cell[][] = [
    [
      {
        label: "TP – Correct FAIL",
        value: TP,
        colorClass: "bg-green-100 border-green-400 text-green-900",
        note: "Evaluator=FAIL, Truth=FAIL",
      },
      {
        label: "FN – Missed FAIL",
        value: FN,
        colorClass: "bg-red-100 border-red-400 text-red-900",
        note: "Evaluator=PASS, Truth=FAIL ← high-stakes miss",
      },
    ],
    [
      {
        label: "FP – False Alarm",
        value: FP,
        colorClass: "bg-orange-50 border-orange-300 text-orange-800",
        note: "Evaluator=FAIL, Truth=PASS",
      },
      {
        label: "TN – Correct PASS",
        value: TN,
        colorClass: "bg-green-50 border-green-300 text-green-800",
        note: "Evaluator=PASS, Truth=PASS",
      },
    ],
  ];

  return (
    <div className="space-y-2">
      {/* Axis labels */}
      <div className="grid grid-cols-[80px_1fr_1fr] text-xs text-slate-500 font-medium">
        <div />
        <div className="text-center">Predicted FAIL</div>
        <div className="text-center">Predicted PASS</div>
      </div>

      {cells.map((row, ri) => (
        <div key={ri} className="grid grid-cols-[80px_1fr_1fr] gap-2 items-center">
          <div className="text-xs text-slate-500 font-medium text-right pr-2">
            {ri === 0 ? "Truth FAIL" : "Truth PASS"}
          </div>
          {row.map((cell, ci) => (
            <div
              key={ci}
              className={`rounded border-2 p-3 text-center ${cell.colorClass}`}
            >
              <div className="text-2xl font-bold tabular-nums">{cell.value}</div>
              <div className="text-[10px] font-semibold mt-0.5">{cell.label}</div>
              {cell.note && (
                <div className="text-[10px] opacity-70 mt-0.5">{cell.note}</div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

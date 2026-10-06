"use client";
// ============================================================
// ClickableConfusionMatrix — interactive binary PASS/FAIL matrix
//
// Each cell (TP/FP/TN/FN) is a button. Clicking a cell opens
// an inline drawer listing the cases that fall into it, with
// input preview and a link to /evidence/[id] for full review.
//
// Props are fully serializable — safe to pass from a server
// component to this client component.
// ============================================================
import { useState } from "react";
import type { BinaryConfusionMatrix, Label } from "@/core/types";

export type MatrixCellType = "TP" | "FP" | "TN" | "FN";

export interface MatrixCellCase {
  caseId: string;
  inputPreview: string;
  groundTruth: Label;
  predicted: Label;
}

export interface MatrixCaseLists {
  TP: MatrixCellCase[];
  FP: MatrixCellCase[];
  TN: MatrixCellCase[];
  FN: MatrixCellCase[];
}

interface Props {
  matrix: BinaryConfusionMatrix;
  caseLists: MatrixCaseLists;
}

const CELL_LABEL: Record<MatrixCellType, string> = {
  TP: "Correct FAIL",
  FP: "False Alarm",
  TN: "Correct PASS",
  FN: "Missed FAIL",
};

const CELL_VALUE_CLASS: Record<MatrixCellType, string> = {
  TP: "text-jh-text",
  FP: "text-jh-amber",
  TN: "text-jh-text",
  FN: "text-jh-red",
};

const CELL_BADGE_CLASS: Record<MatrixCellType, string> = {
  TP: "text-jh-green font-semibold",
  FP: "text-jh-amber font-semibold",
  TN: "text-jh-green font-semibold",
  FN: "text-jh-red font-semibold",
};

export function ClickableConfusionMatrix({ matrix, caseLists }: Props) {
  const [selected, setSelected] = useState<MatrixCellType | null>(null);
  const { TP, FP, TN, FN } = matrix;
  const total = TP + FP + TN + FN;

  function handleCell(cell: MatrixCellType) {
    setSelected((prev) => (prev === cell ? null : cell));
  }

  function cellClass(cell: MatrixCellType, extra = "") {
    const isSelected = selected === cell;
    const count = matrix[cell];
    const clickable = count > 0;
    return [
      "border border-jh-border p-2 text-center transition-colors",
      clickable ? "cursor-pointer" : "cursor-default opacity-70",
      isSelected ? "bg-jh-panel ring-1 ring-inset ring-jh-border" : (clickable ? "hover:bg-jh-panel/60" : ""),
      extra,
    ].join(" ");
  }

  const selectedCases = selected ? caseLists[selected] : [];

  return (
    <div>
      {/* ── Axis legend ──────────────────────────────────── */}
      <div className="grid grid-cols-[56px_1fr_1fr] mb-0.5">
        <div />
        <div className="text-center text-[10px] font-mono text-jh-dim py-0.5 border-b border-jh-border-lt">
          Predicted FAIL
        </div>
        <div className="text-center text-[10px] font-mono text-jh-dim py-0.5 border-b border-jh-border-lt">
          Predicted PASS
        </div>
      </div>

      {/* ── TRUTH FAIL row ───────────────────────────────── */}
      <div className="grid grid-cols-[56px_1fr_1fr] items-stretch">
        <div className="flex items-center justify-end pr-2">
          <span className="text-[10px] font-mono text-jh-dim [writing-mode:vertical-rl] rotate-180">
            Truth FAIL
          </span>
        </div>

        {/* TP */}
        <button
          onClick={() => TP > 0 && handleCell("TP")}
          className={cellClass("TP")}
          title={TP > 0 ? `Click to inspect ${TP} correct-FAIL case${TP > 1 ? "s" : ""}` : "No cases"}
        >
          <div className={`text-xl font-mono font-bold tabular-nums ${CELL_VALUE_CLASS.TP}`}>{TP}</div>
          <div className={`text-[10px] font-mono mt-0.5 ${CELL_BADGE_CLASS.TP}`}>TP</div>
          <div className="text-[9px] text-jh-dim mt-0.5 leading-tight">Correct FAIL</div>
          {TP > 0 && (
            <div className="text-[8px] text-jh-dim mt-1 border-t border-jh-border-lt pt-0.5">
              {selected === "TP" ? "▲ collapse" : "▼ inspect"}
            </div>
          )}
        </button>

        {/* FN — most dangerous cell */}
        <button
          onClick={() => FN > 0 && handleCell("FN")}
          className={cellClass("FN", "border-l-0")}
          style={selected !== "FN" ? { background: "rgba(153,27,27,0.05)" } : undefined}
          title={FN > 0 ? `Click to inspect ${FN} missed-FAIL case${FN > 1 ? "s" : ""}` : "No missed FAILs — good"}
        >
          <div className={`text-xl font-mono font-bold tabular-nums ${CELL_VALUE_CLASS.FN}`}>{FN}</div>
          <div className={`text-[10px] font-mono mt-0.5 ${CELL_BADGE_CLASS.FN}`}>FN ←</div>
          <div className="text-[9px] text-jh-dim mt-0.5 leading-tight">Missed FAIL</div>
          {FN > 0 && (
            <div className="text-[8px] text-jh-dim mt-1 border-t border-jh-border-lt pt-0.5">
              {selected === "FN" ? "▲ collapse" : "▼ inspect"}
            </div>
          )}
        </button>
      </div>

      {/* ── TRUTH PASS row ───────────────────────────────── */}
      <div className="grid grid-cols-[56px_1fr_1fr] items-stretch">
        <div className="flex items-center justify-end pr-2">
          <span className="text-[10px] font-mono text-jh-dim [writing-mode:vertical-rl] rotate-180">
            Truth PASS
          </span>
        </div>

        {/* FP */}
        <button
          onClick={() => FP > 0 && handleCell("FP")}
          className={cellClass("FP", "border-t-0")}
          title={FP > 0 ? `Click to inspect ${FP} false-alarm case${FP > 1 ? "s" : ""}` : "No false alarms"}
        >
          <div className={`text-xl font-mono font-bold tabular-nums ${CELL_VALUE_CLASS.FP}`}>{FP}</div>
          <div className={`text-[10px] font-mono mt-0.5 ${CELL_BADGE_CLASS.FP}`}>FP</div>
          <div className="text-[9px] text-jh-dim mt-0.5 leading-tight">False Alarm</div>
          {FP > 0 && (
            <div className="text-[8px] text-jh-dim mt-1 border-t border-jh-border-lt pt-0.5">
              {selected === "FP" ? "▲ collapse" : "▼ inspect"}
            </div>
          )}
        </button>

        {/* TN */}
        <button
          onClick={() => TN > 0 && handleCell("TN")}
          className={cellClass("TN", "border-t-0 border-l-0")}
          title={TN > 0 ? `Click to inspect ${TN} correct-PASS case${TN > 1 ? "s" : ""}` : "No cases"}
        >
          <div className={`text-xl font-mono font-bold tabular-nums ${CELL_VALUE_CLASS.TN}`}>{TN}</div>
          <div className={`text-[10px] font-mono mt-0.5 ${CELL_BADGE_CLASS.TN}`}>TN</div>
          <div className="text-[9px] text-jh-dim mt-0.5 leading-tight">Correct PASS</div>
          {TN > 0 && (
            <div className="text-[8px] text-jh-dim mt-1 border-t border-jh-border-lt pt-0.5">
              {selected === "TN" ? "▲ collapse" : "▼ inspect"}
            </div>
          )}
        </button>
      </div>

      {/* ── Legend ───────────────────────────────────────── */}
      <div className="mt-2 pt-2 border-t border-jh-border-lt text-[10px] font-mono text-jh-dim space-y-0.5">
        <div>n={total} · positive class = FAIL · click any cell to inspect cases</div>
        <div>
          <span className="text-jh-red">FN = evaluator misses a FAIL</span>
          {" — "}high-stakes miss, primary concern
        </div>
      </div>

      {/* ── Case drawer ──────────────────────────────────── */}
      {selected && selectedCases.length > 0 && (
        <div className="mt-3 border border-jh-border-lt bg-jh-bg/60">
          {/* Drawer header */}
          <div className="flex items-center justify-between px-3 py-1.5 bg-jh-panel border-b border-jh-border-lt">
            <div className="font-mono text-[10px] font-semibold text-jh-text uppercase tracking-wide">
              <span className={CELL_BADGE_CLASS[selected]}>{selected}</span>
              <span className="text-jh-dim ml-2 font-normal">·</span>
              <span className="ml-2">{CELL_LABEL[selected]}</span>
              <span className="text-jh-dim ml-2">
                · {selectedCases.length} case{selectedCases.length !== 1 ? "s" : ""}
              </span>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="font-mono text-[10px] text-jh-dim hover:text-jh-text transition-colors px-1"
            >
              ✕
            </button>
          </div>

          {/* Case list */}
          <div className="divide-y divide-jh-border-lt max-h-52 overflow-y-auto">
            {selectedCases.map(({ caseId, inputPreview, groundTruth, predicted }) => (
              <div
                key={caseId}
                className="flex items-center gap-3 px-3 py-2 font-mono text-[10px] hover:bg-jh-panel/40 transition-colors"
              >
                <span className="text-jh-text whitespace-nowrap w-24 shrink-0">{caseId}</span>
                <span className="text-jh-dim flex-1 truncate" title={inputPreview}>
                  {inputPreview}
                </span>
                <span className="text-jh-dim whitespace-nowrap shrink-0 hidden sm:inline">
                  truth=<span className={groundTruth === "FAIL" ? "text-jh-red" : "text-jh-dim"}>{groundTruth}</span>
                  {" "}pred=<span className={predicted === "FAIL" ? "text-jh-red" : "text-jh-dim"}>{predicted}</span>
                </span>
                <a
                  href={`/evidence/${caseId}`}
                  className="font-mono text-[10px] text-jh-text border border-jh-border-lt px-2 py-0.5 hover:bg-jh-panel whitespace-nowrap shrink-0 transition-colors"
                >
                  Review →
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

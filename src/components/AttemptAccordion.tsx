"use client";
// ============================================================
// AttemptAccordion — expandable per-attempt detail in the
//                    Calibration Report.
//
// Receives a plain-serializable AttemptRow[] from the server
// component. No server imports, no mutations, no actions.
//
// Each row shows:
//   collapsed: attempt #, version, decision badge, key metrics
//   expanded : full rubric, diff from predecessor, rationale,
//              per-class metrics, targeted/risk results,
//              regressions/misses, decision justification,
//              run ID + version provenance
// ============================================================
import { useState } from "react";
import { RubricDiff } from "@/components/RubricDiff";

// ── Serializable metric shape (no server types) ───────────────
export interface AttemptMetrics {
  overallAgreement: number;
  failRecall: number;
  failPrecision: number;
  fp: number;
  fn: number;
  tp: number;
  tn: number;
  failRecallCILower: number;
  failRecallCIUpper: number;
  sampleN: number;
}

export interface AttemptRow {
  attemptNumber: number;
  candidateId: string;
  evaluatorVersion: string;
  rubricVersion: string;
  rubricText: string;
  /** rubricText of the immediately preceding candidate, or baseline rubric for attempt #1 */
  predecessorRubricText: string;
  predecessorLabel: string;         // e.g. "Baseline" or "Attempt #1"
  createdAt: string;
  interventionRationale: string;
  decision: "accepted" | "rejected" | null;
  decisionRationale: string | null;
  decidedAt: string | null;
  metrics: AttemptMetrics | null;   // null if run incomplete/missing
  trgDetected: number | null;       // targeted/risk FAIL cases detected
  trgTotal: number;                 // total targeted/risk FAIL cases
  runId: string | null;
  /** caseIds in FN cell (missed FAILs) */
  missedFails: string[];
  /** caseIds in FP cell (false alarms) */
  falseAlarms: string[];
}

// ── Helpers ───────────────────────────────────────────────────

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function MetricCell({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: "ok" | "warn" | "error";
}) {
  const colorMap = { ok: "text-jh-green", warn: "text-jh-amber", error: "text-jh-red" };
  return (
    <div className="border border-jh-border-lt p-2 text-center">
      <div className="font-mono text-[9px] text-jh-dim uppercase tracking-wide mb-1">{label}</div>
      <div className={`font-mono font-bold text-sm ${highlight ? colorMap[highlight] : "text-jh-text"}`}>
        {value}
      </div>
      {sub && <div className="font-mono text-[9px] text-jh-dim mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Single attempt row ────────────────────────────────────────

function AttemptRow({ row, defaultOpen }: { row: AttemptRow; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  const accepted = row.decision === "accepted";
  const rejected = row.decision === "rejected";

  const decisionColor  = accepted ? "text-jh-green" : rejected ? "text-jh-red" : "text-jh-amber";
  const decisionBorder = accepted
    ? "border-jh-green/50 bg-green-50/10"
    : rejected
    ? "border-jh-red/40 bg-red-50/10"
    : "border-jh-border-lt";

  return (
    <div className={`border ${decisionBorder} overflow-hidden`}>
      {/* ── Collapsed header ─── */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-jh-bg/40 transition-colors"
        aria-expanded={open}
      >
        {/* Attempt badge */}
        <span className="font-mono text-[10px] text-jh-dim w-20 shrink-0 tabular-nums">
          Attempt #{row.attemptNumber}
        </span>

        {/* Version */}
        <span className="font-mono text-[10px] text-jh-text flex-1 truncate">
          {row.evaluatorVersion}
        </span>

        {/* Key metrics (collapsed) */}
        {row.metrics && (
          <span className="font-mono text-[10px] text-jh-dim hidden sm:flex gap-4 shrink-0">
            <span>OA {pct(row.metrics.overallAgreement)}</span>
            <span className={row.metrics.failRecall >= 0.7 ? "text-jh-green" : "text-jh-red"}>
              FAIL recall {pct(row.metrics.failRecall)}
            </span>
          </span>
        )}
        {!row.metrics && (
          <span className="font-mono text-[9px] text-jh-border-mid shrink-0">— no run data</span>
        )}

        {/* Decision */}
        <span className={`font-mono text-[10px] font-semibold shrink-0 ${decisionColor}`}>
          {row.decision ? row.decision.toUpperCase() : "PENDING"}
        </span>

        {/* Chevron */}
        <span className="font-mono text-jh-dim text-[10px] shrink-0 ml-1">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {/* ── Expanded body ─── */}
      {open && (
        <div className="border-t border-jh-border-lt px-4 py-4 space-y-5 bg-jh-bg/30">

          {/* Provenance strip */}
          <div className="flex flex-wrap gap-4 font-mono text-[9px] text-jh-dim border border-jh-border-lt px-3 py-2 bg-jh-panel">
            <span>Version: <span className="text-jh-text">{row.evaluatorVersion}</span></span>
            <span>Rubric: <span className="text-jh-text">{row.rubricVersion}</span></span>
            {row.runId && <span>Run ID: <span className="text-jh-text">{row.runId}</span></span>}
            <span>Created: <span className="text-jh-text">{new Date(row.createdAt).toLocaleString()}</span></span>
            {row.decidedAt && (
              <span>Decided: <span className="text-jh-text">{new Date(row.decidedAt).toLocaleString()}</span></span>
            )}
          </div>

          {/* Intervention rationale */}
          <div>
            <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-jh-dim mb-1">
              Intervention Rationale
            </div>
            <p className="font-mono text-[10px] text-jh-text leading-relaxed bg-jh-panel border border-jh-border-lt px-3 py-2">
              {row.interventionRationale}
            </p>
          </div>

          {/* Representative metrics */}
          {row.metrics ? (
            <div>
              <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-jh-dim mb-2">
                Representative Metrics (n={row.metrics.sampleN})
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                <MetricCell
                  label="OA"
                  value={pct(row.metrics.overallAgreement)}
                  highlight={row.metrics.overallAgreement >= 0.9 ? "ok" : "warn"}
                />
                <MetricCell
                  label="FAIL Recall"
                  value={pct(row.metrics.failRecall)}
                  sub={`CI [${pct(row.metrics.failRecallCILower)}, ${pct(row.metrics.failRecallCIUpper)}]`}
                  highlight={row.metrics.failRecall >= 0.7 ? "ok" : "error"}
                />
                <MetricCell
                  label="FAIL Precision"
                  value={pct(row.metrics.failPrecision)}
                />
                <MetricCell label="TP" value={String(row.metrics.tp)} />
                <MetricCell label="FP" value={String(row.metrics.fp)} highlight={row.metrics.fp > 0 ? "warn" : undefined} />
                <MetricCell label="FN" value={String(row.metrics.fn)} highlight={row.metrics.fn > 0 ? "error" : undefined} />
              </div>
            </div>
          ) : (
            <div className="font-mono text-[10px] text-jh-dim italic border border-jh-border-lt px-3 py-2">
              Metrics not available — revalidation run not completed for this attempt.
            </div>
          )}

          {/* Targeted/risk FAIL detection */}
          <div>
            <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-jh-dim mb-1">
              Targeted / Risk — FAIL Detection
            </div>
            <div className="font-mono text-[10px] text-jh-text border border-jh-border-lt px-3 py-2">
              {row.trgDetected !== null
                ? `${row.trgDetected} / ${row.trgTotal} targeted FAIL cases detected`
                : `— / ${row.trgTotal} (run not completed)`}
              {row.trgDetected !== null && row.trgDetected < row.trgTotal && (
                <span className="text-jh-red ml-2 font-semibold">
                  ⚠ {row.trgTotal - row.trgDetected} missed
                </span>
              )}
            </div>
          </div>

          {/* Regressions / misses */}
          {(row.missedFails.length > 0 || row.falseAlarms.length > 0) && (
            <div>
              <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-jh-dim mb-2">
                Regressions &amp; Misses
              </div>
              <div className="space-y-1.5">
                {row.missedFails.length > 0 && (
                  <div className="font-mono text-[10px] text-jh-red border border-jh-red/30 bg-red-50/10 px-3 py-1.5">
                    <span className="font-semibold">Missed FAILs (FN): </span>
                    {row.missedFails.join(", ")}
                  </div>
                )}
                {row.falseAlarms.length > 0 && (
                  <div className="font-mono text-[10px] text-jh-amber border border-jh-amber/30 bg-amber-50/10 px-3 py-1.5">
                    <span className="font-semibold">False Alarms (FP): </span>
                    {row.falseAlarms.join(", ")}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Decision justification */}
          {row.decision && (
            <div>
              <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-jh-dim mb-1">
                Decision — {row.decision.toUpperCase()}
              </div>
              <p className={`font-mono text-[10px] leading-relaxed border px-3 py-2 ${
                accepted ? "border-jh-green/40 text-jh-green" : "border-jh-red/40 text-jh-red"
              }`}>
                {row.decisionRationale ?? "No rationale recorded."}
              </p>
            </div>
          )}

          {/* Rubric used (full text) */}
          <div>
            <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-jh-dim mb-1">
              Rubric Used (Attempt #{row.attemptNumber})
            </div>
            <pre className="font-mono text-[10px] leading-relaxed bg-jh-bg border border-jh-border-lt p-3 overflow-auto max-h-48 whitespace-pre-wrap text-jh-text">
              {row.rubricText}
            </pre>
          </div>

          {/* Diff from predecessor */}
          <div>
            <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-jh-dim mb-2">
              Rubric Changes — vs {row.predecessorLabel}
            </div>
            <RubricDiff
              before={row.predecessorRubricText}
              after={row.rubricText}
              beforeLabel={row.predecessorLabel}
              afterLabel={`Attempt #${row.attemptNumber}`}
            />
          </div>

        </div>
      )}
    </div>
  );
}

// ── Main exported component ───────────────────────────────────

interface AttemptAccordionProps {
  rows: AttemptRow[];
}

export function AttemptAccordion({ rows }: AttemptAccordionProps) {
  if (rows.length === 0) {
    return (
      <div className="font-mono text-[10px] text-jh-dim italic px-4 py-6 text-center">
        No attempt detail available.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <AttemptRow
          key={row.candidateId}
          row={row}
          /* Auto-expand the accepted (final) attempt */
          defaultOpen={row.decision === "accepted"}
        />
      ))}
    </div>
  );
}

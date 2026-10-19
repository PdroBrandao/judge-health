// ============================================================
// /evidence — Evidence List
//
// Shows all cases in two analytically separate streams:
//   Representative (valid for population estimates)
//   Targeted/Risk (investigation only — excluded from metrics)
//
// Run selector: a ?run=<runId> URL param controls which run's
// judgments are displayed. Defaults to the current-candidate run
// (if under review) or the baseline run (otherwise).
// Never silently falls back to fixture or type-based lookup.
// ============================================================
import Link from "next/link";
import { FixtureRepository } from "@/data/fixture-repository";
import { WorkflowStore } from "@/data/workflow-store";
import { RunStore, liveJudgmentsToJudgments } from "@/data/run-store";
import { EvidenceRunSelector } from "@/components/EvidenceRunSelector";
import { EvaluationSummaryPanel } from "@/components/EvaluationSummary";
import { InstrumentPanel } from "@/components/instrument/InstrumentPanel";
import { StatusLED } from "@/components/instrument/StatusLED";
import {
  buildEvaluationSummary,
  recordedDecisionForRun,
} from "@/app/evidence/evaluation-summary";
import type { CandidateRecord, EvaluationRun, EvidenceSummary, CaseResult, Label } from "@/core/types";

// ── RunOption — serializable, passed to client selector ───────
export interface RunOption {
  runId: string;
  label: string;
  evaluatorVersion: string;
  model: string;
  attemptNumber: number | null;
  status: string;
  judgedCount: number;
  totalCount: number;
  completedAt: string | null;
  isCurrent: boolean;
}

// ── Pure helper: build selector options ───────────────────────
// Baseline first, then candidates in chronological order.
// Only includes runs that exist in RunStore (i.e. have been created).
export function buildRunOptions(
  candidates: CandidateRecord[],
  baselineRunId: string | null,
  getRun: (id: string) => EvaluationRun | undefined,
): RunOption[] {
  const options: RunOption[] = [];

  // Baseline
  if (baselineRunId) {
    const run = getRun(baselineRunId);
    if (run) {
      options.push({
        runId:            run.runId,
        label:            "Live Baseline",
        evaluatorVersion: run.evaluatorVersion,
        model:            run.model,
        attemptNumber:    null,
        status:           run.status,
        judgedCount:      run.judgments.length,
        totalCount:       run.sampleIds.length,
        completedAt:      run.completedAt,
        isCurrent:        false,
      });
    }
  }

  // The current-under-review candidate (for isCurrent flag)
  const activeCandidateId = candidates.find((c) => c.status === "under_review")?.candidateId ?? null;

  // Candidates — chronological (insertion order)
  for (const cand of candidates) {
    if (!cand.revalidationRunId) continue;
    const run = getRun(cand.revalidationRunId);
    if (!run) continue;
    options.push({
      runId:            run.runId,
      label:            `Candidate Attempt #${cand.attemptNumber}`,
      evaluatorVersion: cand.evaluatorVersion,
      model:            run.model,
      attemptNumber:    cand.attemptNumber,
      status:           run.status,
      judgedCount:      run.judgments.length,
      totalCount:       run.sampleIds.length,
      completedAt:      run.completedAt,
      isCurrent:        cand.candidateId === activeCandidateId,
    });
  }

  return options;
}

// ── Pure helper: resolve default run ID ───────────────────────
// Priority:
//   1. Current candidate under_review + completed revalidation run
//   2. Baseline run (live + completed/partial_failure)
//   3. null (no suitable run found)
export function resolveDefaultRunId(
  candidates: CandidateRecord[],
  baselineRunId: string | null,
  getRun: (id: string) => EvaluationRun | undefined,
): string | null {
  // Current candidate under review
  const activeCand = candidates.find((c) => c.status === "under_review");
  if (activeCand?.revalidationRunId) {
    const run = getRun(activeCand.revalidationRunId);
    if (run && (run.status === "completed" || run.status === "partial_failure")) {
      return activeCand.revalidationRunId;
    }
  }

  // Baseline
  if (baselineRunId) {
    const run = getRun(baselineRunId);
    if (
      run &&
      run.mode === "live" &&
      (run.status === "completed" || run.status === "partial_failure")
    ) {
      return baselineRunId;
    }
  }

  return null;
}

// ── Apply live judgments to fixture summaries ─────────────────
function applyRunJudgments(
  summaries: EvidenceSummary[],
  liveMap: Map<string, Label>,
): EvidenceSummary[] {
  return summaries.map((s) => {
    const liveLabel = liveMap.get(s.caseId);
    if (!liveLabel) return s;
    const result: CaseResult =
      s.groundTruth === "FAIL" && liveLabel === "FAIL" ? "TP"
      : s.groundTruth === "PASS" && liveLabel === "PASS" ? "TN"
      : s.groundTruth === "FAIL" && liveLabel === "PASS" ? "FN"
      : "FP";
    return { ...s, evaluatorLabel: liveLabel, result };
  });
}

// ── Result cell helpers ───────────────────────────────────────
const RESULT_STYLES: Record<CaseResult, { label: string; color: string; led: "ok" | "error" | "warning" | "inactive" }> = {
  TP: { label: "TP ✓",        color: "text-jh-green",  led: "ok" },
  TN: { label: "TN ✓",        color: "text-jh-dim",    led: "ok" },
  FP: { label: "FP — alarm",  color: "text-jh-amber",  led: "warning" },
  FN: { label: "FN ← MISSED", color: "text-jh-red",    led: "error" },
};

function ResultBadge({ result }: { result: CaseResult }) {
  const s = RESULT_STYLES[result];
  return (
    <div className="flex items-center gap-1.5">
      <StatusLED status={s.led} size="sm" />
      <span className={`font-mono text-[10px] font-semibold ${s.color}`}>
        {s.label}
      </span>
    </div>
  );
}

// ── Evidence table ────────────────────────────────────────────
function EvidenceTable({
  rows,
  showRiskNote = false,
  isLive = false,
  selectedRunId,
}: {
  rows: EvidenceSummary[];
  showRiskNote?: boolean;
  isLive?: boolean;
  selectedRunId: string | null;
}) {
  const disagreements = rows.filter((r) => r.result === "FN" || r.result === "FP");
  const agreements    = rows.filter((r) => r.result === "TP" || r.result === "TN");
  const ordered = [...disagreements, ...agreements];

  return (
    <table className="w-full text-[11px] font-mono">
      <thead>
        <tr className="border-b border-jh-border bg-jh-bg/60 text-jh-dim text-[10px] uppercase tracking-[0.1em]">
          <th className="text-left px-3 py-2 font-normal">Case ID</th>
          <th className="text-left px-3 py-2 font-normal">Input preview</th>
          <th className="text-center px-2 py-2 font-normal">Truth</th>
          <th className="text-center px-2 py-2 font-normal">Evaluator</th>
          <th className="text-left px-3 py-2 font-normal">Result</th>
          {showRiskNote && (
            <th className="text-left px-3 py-2 font-normal">Risk note</th>
          )}
          <th className="px-2 py-2" />
        </tr>
      </thead>
      <tbody>
        {ordered.map((row) => {
          const isMiss = row.result === "FN" || row.result === "FP";
          // Build detail href — include ?run= if a run is selected
          const detailHref = selectedRunId
            ? `/evidence/${row.caseId}?run=${selectedRunId}`
            : `/evidence/${row.caseId}`;
          return (
            <tr
              key={row.caseId}
              className={`border-b border-jh-border-lt ${isMiss ? "bg-red-50/30" : ""}`}
            >
              {/* Case ID */}
              <td className="px-3 py-2 font-mono text-[10px] text-jh-text whitespace-nowrap">
                {row.caseId}
              </td>

              {/* Input preview */}
              <td className="px-3 py-2 text-jh-dim max-w-[280px]">
                <span className="line-clamp-1">
                  {row.inputPreview ?? <span className="text-jh-border-mid italic">—</span>}
                </span>
              </td>

              {/* Ground truth */}
              <td className="px-2 py-2 text-center">
                <span
                  className={`font-semibold ${
                    row.groundTruth === "FAIL" ? "text-jh-red" : "text-jh-green"
                  }`}
                >
                  {row.groundTruth}
                </span>
              </td>

              {/* Evaluator */}
              <td className="px-2 py-2 text-center">
                {isLive ? (
                  <span className={row.evaluatorLabel === "FAIL" ? "text-jh-red" : "text-jh-dim"}>
                    {row.evaluatorLabel}
                  </span>
                ) : (
                  <span className="text-jh-border-mid">—</span>
                )}
              </td>

              {/* Result */}
              <td className="px-3 py-2">
                {isLive ? (
                  <ResultBadge result={row.result} />
                ) : (
                  <span className="font-mono text-[10px] text-jh-border-mid">—</span>
                )}
              </td>

              {/* Risk note (targeted only) */}
              {showRiskNote && (
                <td className="px-3 py-2 text-jh-amber max-w-[200px]">
                  <span className="line-clamp-1 text-[10px]">
                    {row.riskNote ?? "—"}
                  </span>
                </td>
              )}

              {/* View link */}
              <td className="px-2 py-2 text-right">
                {row.hasContent ? (
                  <Link
                    href={detailHref}
                    className="font-mono text-[10px] text-jh-text border border-jh-border-lt px-2 py-0.5 hover:border-jh-border hover:bg-jh-bg transition-colors whitespace-nowrap"
                  >
                    View →
                  </Link>
                ) : (
                  <span className="font-mono text-[10px] text-jh-border-mid">—</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Page ─────────────────────────────────────────────────────
export default async function EvidencePage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  const { run: runParam } = await searchParams;

  // ── Build selector options ────────────────────────────────
  const candidates   = WorkflowStore.getAllCandidates();
  const baselineRunId = WorkflowStore.getBaselineRunId();
  const getRun = (id: string) => RunStore.getRun(id);

  const runOptions = buildRunOptions(candidates, baselineRunId, getRun);

  // ── Resolve which run to display ──────────────────────────
  const defaultRunId  = resolveDefaultRunId(candidates, baselineRunId, getRun);
  const selectedRunId = runParam ?? defaultRunId;
  const selectedRun   = selectedRunId ? getRun(selectedRunId) : undefined;

  // ── Apply judgments from selected run ─────────────────────
  let repSummaries = FixtureRepository.getEvidenceSummaries("representative");
  let trgSummaries = FixtureRepository.getEvidenceSummaries("targeted_risk");
  const isLive = !!(
    selectedRun &&
    selectedRun.mode === "live" &&
    (selectedRun.status === "completed" ||
     selectedRun.status === "partial_failure" ||
     selectedRun.status === "running")
  );

  const liveJudgments = isLive && selectedRun
    ? liveJudgmentsToJudgments(selectedRun.judgments)
    : null;

  if (liveJudgments) {
    const liveMap = new Map(liveJudgments.map((j) => [j.caseId, j.predictedLabel as Label]));
    repSummaries = applyRunJudgments(repSummaries, liveMap);
    trgSummaries = applyRunJudgments(trgSummaries, liveMap);
  }

  const repFN = isLive ? repSummaries.filter((r) => r.result === "FN").length : 0;
  const repFP = isLive ? repSummaries.filter((r) => r.result === "FP").length : 0;
  const trgFN = isLive ? trgSummaries.filter((r) => r.result === "FN").length : 0;

  const recordedDecision = recordedDecisionForRun(
    selectedRunId ?? null,
    candidates,
    WorkflowStore.getAllDecisions(),
  );
  const evaluationSummary =
    liveJudgments && selectedRun
      ? buildEvaluationSummary({
          cases: FixtureRepository.getCases(),
          judgments: liveJudgments,
          evaluatorVersion: selectedRun.evaluatorVersion,
          recordedDecision,
        })
      : null;

  // ── Provenance line ───────────────────────────────────────
  // Find the matching RunOption for the selected run
  const selectedOption = runOptions.find((o) => o.runId === selectedRunId);

  return (
    <main className="min-h-screen bg-jh-bg p-3 lg:p-4">
      <div className="max-w-[1100px] mx-auto">

        {/* Page identity */}
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-jh-border-lt">
          <div>
            <h2 className="font-sketch text-[1.6rem] font-bold leading-none tracking-wide text-jh-text">
              Evidence
            </h2>
            <p className="font-mono text-[11px] text-jh-dim mt-0.5">
              All evaluated cases — representative and targeted/risk streams.
            </p>
          </div>
          {selectedRun ? (
            <span className={`font-mono text-[10px] border px-2 py-1 flex items-center gap-1.5 ${
              selectedRun.status === "completed" || selectedRun.status === "partial_failure"
                ? "border-jh-green/60 text-jh-green"
                : selectedRun.status === "running"
                ? "border-jh-amber/60 text-jh-amber"
                : "border-jh-border-lt text-jh-dim"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full inline-block shrink-0 ${
                selectedRun.status === "completed" || selectedRun.status === "partial_failure"
                  ? "bg-jh-led-green"
                  : selectedRun.status === "running"
                  ? "bg-jh-led-amber"
                  : "bg-jh-border-mid"
              }`} />
              LIVE · {selectedRun.model} · {selectedRun.runId.slice(-8).toUpperCase()}
            </span>
          ) : (
            <span className="font-mono text-[10px] text-jh-dim border border-jh-border-lt px-2 py-1">
              NO RUN SELECTED
            </span>
          )}
        </div>

        {/* ── Run selector ─────────────────────────────────── */}
        {runOptions.length > 0 && (
          <div className="mb-3">
            <EvidenceRunSelector
              options={runOptions}
              currentRunId={selectedRunId ?? null}
            />
          </div>
        )}

        {/* ── Provenance strip ─────────────────────────────── */}
        {selectedOption && (
          <div className="font-mono text-[10px] border border-jh-border-lt bg-jh-panel px-3 py-2 mb-3 flex flex-wrap gap-4 items-center">
            <span className="text-jh-dim">
              Source:{" "}
              <span className="text-jh-text font-semibold">{selectedOption.label}</span>
            </span>
            <span className="text-jh-dim">
              Version: <span className="text-jh-text">{selectedOption.evaluatorVersion}</span>
            </span>
            <span className="text-jh-dim">
              Run ID: <span className="text-jh-text font-mono">{selectedOption.runId}</span>
            </span>
            <span className="text-jh-dim">
              Model: <span className="text-jh-text">{selectedOption.model}</span>
            </span>
            {selectedOption.attemptNumber !== null && (
              <span className="text-jh-dim">
                Attempt: <span className="text-jh-text">#{selectedOption.attemptNumber}</span>
              </span>
            )}
            <span className={selectedOption.judgedCount < selectedOption.totalCount ? "text-jh-amber" : "text-jh-dim"}>
              Evaluated:{" "}
              <span className={selectedOption.judgedCount < selectedOption.totalCount ? "font-semibold" : "text-jh-text"}>
                {selectedOption.judgedCount}/{selectedOption.totalCount}
              </span>
              {selectedOption.judgedCount < selectedOption.totalCount && (
                <span className="ml-1 text-jh-amber">· IN PROGRESS</span>
              )}
            </span>
          </div>
        )}

        {/* No-run warning */}
        {!selectedRun && runOptions.length === 0 && (
          <div className="font-mono text-[10px] text-jh-amber border border-jh-amber/40 bg-amber-50/10 px-3 py-2 mb-3">
            No live run available. Run Live Baseline to populate evidence with live judgments.
          </div>
        )}

        {/* Notice */}
        <div className="font-mono text-[10px] text-jh-dim border border-jh-border-lt bg-jh-panel px-3 py-2 mb-3">
          <span className="font-semibold text-jh-text">Analytical boundary: </span>
          Representative and targeted/risk streams are kept separate.
          Population-level reliability estimates use the representative stream only.
          Targeted/risk cases are selected for investigation, not as an unbiased sample.
        </div>

        <EvaluationSummaryPanel
          summary={evaluationSummary}
          selectedRunId={selectedRunId ?? null}
          runLabel={selectedOption?.label ?? null}
        />

        {/* ── REPRESENTATIVE SAMPLE ── */}
        <InstrumentPanel
          label={`Representative Sample — n=${repSummaries.length} · population estimates valid`}
          className="mb-3"
          noPadding
        >
          {/* Stats bar */}
          <div className="flex items-center gap-6 px-3 py-2 border-b border-jh-border-lt bg-jh-bg/40 font-mono text-[10px]">
            <span className="text-jh-dim">
              Reference:{" "}
              <span className="text-jh-text">
                {repSummaries.filter((r) => r.groundTruth === "PASS").length} PASS /{" "}
                {repSummaries.filter((r) => r.groundTruth === "FAIL").length} FAIL
              </span>
            </span>
            {isLive ? (<>
              <span className="text-jh-green">
                ✓ {repSummaries.filter((r) => r.result === "TP" || r.result === "TN").length} correct
              </span>
              {repFN > 0 && (
                <span className="text-jh-red font-semibold">
                  ● {repFN} missed FAIL (FN) ← investigation priority
                </span>
              )}
              {repFP > 0 && (
                <span className="text-jh-amber">
                  ▲ {repFP} false alarm (FP)
                </span>
              )}
            </>) : (
              <span className="text-jh-border-mid">Evaluator: — (select a run above)</span>
            )}
          </div>

          <EvidenceTable
            rows={repSummaries}
            isLive={isLive}
            selectedRunId={selectedRunId ?? null}
          />
        </InstrumentPanel>

        {/* ── TARGETED/RISK SAMPLE ── */}
        <InstrumentPanel
          label={`Targeted / Risk Sample — n=${trgSummaries.length} · excluded from population estimates`}
          noPadding
        >
          {/* Warning */}
          <div className="px-3 py-1.5 border-b border-jh-border-lt bg-amber-50/30 font-mono text-[10px] text-jh-amber">
            These cases were selected for investigation due to elevated risk, known failure patterns, or
            manual flagging. They are NOT an unbiased sample of the population.
          </div>

          {/* Stats bar */}
          <div className="flex items-center gap-6 px-3 py-2 border-b border-jh-border-lt bg-jh-bg/40 font-mono text-[10px]">
            <span className="text-jh-dim">
              Composition:{" "}
              <span className="text-jh-text">
                {trgSummaries.filter((r) => r.groundTruth === "FAIL").length} FAIL (high-risk) /{" "}
                {trgSummaries.filter((r) => r.groundTruth === "PASS").length} PASS (edge case)
              </span>
            </span>
            {trgFN > 0 && (
              <span className="text-jh-red font-semibold">
                ● {trgFN} missed FAIL (FN) — evaluator did not catch
              </span>
            )}
          </div>

          <EvidenceTable
            rows={trgSummaries}
            showRiskNote
            isLive={isLive}
            selectedRunId={selectedRunId ?? null}
          />
        </InstrumentPanel>

        {/* Footer */}
        <footer className="mt-4 pt-3 border-t border-jh-border-lt text-center">
          <span className="font-mono text-[10px] text-jh-dim">
            JUDGE HEALTH v0.2 · AACI Framework · Evidence
          </span>
        </footer>
      </div>
    </main>
  );
}

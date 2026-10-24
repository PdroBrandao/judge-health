// ============================================================
// /calibration-report — Read-Only Calibration Report
//
// Server component. Derives every displayed value exclusively
// from already-persisted WorkflowStore and RunStore data.
//
// Zero writes. Zero mutations. No new CRUD.
//
// Sections:
//   1. Calibration Summary   — baseline vs final KPIs
//   2. Calibration Trajectory — chronological table (all attempts)
//   3. Baseline vs Final Rubric — LCS line diff
//   4. Attempt Details       — expandable per-attempt accordion
//
// Guard: if no accepted candidate exists, shows a placeholder.
// ============================================================
import Link from "next/link";
import { FixtureRepository } from "@/data/fixture-repository";
import { WorkflowStore } from "@/data/workflow-store";
import { RunStore, liveJudgmentsToJudgments } from "@/data/run-store";
import {
  computeReliabilityProfile,
  classifyCasesForMatrix,
  pct,
} from "@/core/metrics";
import { InstrumentPanel } from "@/components/instrument/InstrumentPanel";
import { StatusLED } from "@/components/instrument/StatusLED";
import { CalibrationSeal } from "@/components/instrument/CalibrationSeal";
import { RubricDiff } from "@/components/RubricDiff";
import { AttemptAccordion } from "@/components/AttemptAccordion";
import type { AttemptRow } from "@/components/AttemptAccordion";
import { ACTIVE_RUBRIC_TEXT as BASELINE_RUBRIC_TEXT } from "@/data/rubric-text";

// Metrics are computed from representative sample only.
// computeReliabilityProfile filters internally; classifyCasesForMatrix uses
// the case array passed to it, so we pass repCases for representative FN/FP.

import { activeWorkspace } from "@/data/experiment-store";
import { getDataset } from "@/data/datasets";
import { getBaselineRunForExperiment, getCandidateRunForExperiment, getExperimentRun } from "@/data/experiment-run-store";
import { buildExperimentDashboard } from "@/core/experiment-dashboard";
import { RubricDiff as ExperimentRubricDiff } from "@/components/RubricDiff";
import type { ExperimentRecord } from "@/core/types";

function ExperimentReport({ experiment }: { experiment: ExperimentRecord }) {
  const dataset = getDataset(experiment.datasetId);
  const baseline = getBaselineRunForExperiment(experiment.id) ?? null;
  const candidateRun = getCandidateRunForExperiment(experiment.id) ?? null;
  const candidate = experiment.workflow.configs.find((item) => item.id === experiment.workflow.currentCandidateConfigId) ?? null;
  const view = dataset && baseline
    ? buildExperimentDashboard(experiment, baseline, dataset, FixtureRepository.getTriggerConfigs())
    : null;
  const candidateView = dataset && candidate && candidateRun?.status === "completed"
    ? buildExperimentDashboard({ ...experiment, config: candidate }, candidateRun, dataset, FixtureRepository.getTriggerConfigs())
    : null;
  const previous = experiment.workflow.configs.find((item) => item.id === experiment.config.parentConfigId) ?? null;
  const latest = experiment.workflow.decisions.at(-1) ?? null;

  return (
    <main className="min-h-screen bg-jh-bg p-3 lg:p-4">
      <div className="max-w-[900px] mx-auto space-y-4">
        <div className="border-b border-jh-border-lt pb-3">
          <h2 className="font-sketch text-[1.6rem] font-bold leading-none tracking-wide text-jh-text">Calibration Report</h2>
          <p className="font-mono text-[11px] text-jh-dim mt-1">{experiment.name} · current baseline {experiment.config.version}</p>
        </div>
        {!view && (
          <InstrumentPanel label="Report" accent="warn">
            <p className="font-mono text-[11px] text-jh-dim">A completed baseline is required before this report has measurements.</p>
          </InstrumentPanel>
        )}
        {view && (
          <InstrumentPanel label="Current baseline" noPadding>
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-jh-border-lt font-mono">
              {[
                ["Agreement", pct(view.profile.overallAgreement)],
                ["FAIL recall", pct(view.profile.perClass.FAIL.recall)],
                ["FAIL precision", pct(view.profile.perClass.FAIL.precision)],
                ["n", String(view.representativeN)],
              ].map(([label, value]) => (
                <div key={label} className="px-4 py-3">
                  <div className="font-bold text-lg text-jh-text">{value}</div>
                  <div className="text-[9px] text-jh-dim uppercase">{label}</div>
                </div>
              ))}
            </div>
            <p className="px-4 py-2 border-t border-jh-border-lt font-mono text-[10px] text-jh-dim">
              FP {view.profile.confusionMatrix.FP} · FN {view.profile.confusionMatrix.FN} · TP {view.profile.confusionMatrix.TP} · TN {view.profile.confusionMatrix.TN}. Targeted/risk n={view.targetedN} is excluded.
            </p>
          </InstrumentPanel>
        )}
        {view && candidateView && (
          <InstrumentPanel label="Open comparison">
            <p className="font-mono text-[11px] text-jh-text">
              Candidate {candidate?.version} agreement {pct(candidateView.profile.overallAgreement)} versus baseline {pct(view.profile.overallAgreement)}.
            </p>
            <Link href="/revalidation" className="inline-block mt-2 font-mono text-[11px] border border-jh-border px-3 py-1.5">Open revalidation →</Link>
          </InstrumentPanel>
        )}
        {latest && (
          <InstrumentPanel label="Latest decision" accent={latest.decision === "accepted" ? "ok" : "error"}>
            <p className="font-mono text-[11px]">
              {latest.decision === "accepted" ? "Accepted" : "Rejected"} · {latest.baselineVersion} → {latest.candidateVersion}
            </p>
            <p className="font-mono text-[10px] text-jh-dim mt-1">{latest.rationale}</p>
          </InstrumentPanel>
        )}
        {previous && (
          <InstrumentPanel label="Rubric change from the previous baseline">
            <ExperimentRubricDiff before={previous.rubricText} after={experiment.config.rubricText} />
          </InstrumentPanel>
        )}
        {experiment.baselineRunId && getExperimentRun(experiment.baselineRunId)?.runId && (
          <p className="font-mono text-[10px] text-jh-dim">Baseline run {experiment.baselineRunId}. Earlier runs remain stored with this experiment.</p>
        )}
      </div>
    </main>
  );
}

export default function CalibrationReportPage() {
  const workspace = activeWorkspace();
  if (workspace.mode === "configured") {
    return <ExperimentReport experiment={workspace.experiment} />;
  }
  // ── Read all immutable arrays from WorkflowStore ──────────
  const candidates    = WorkflowStore.getAllCandidates();
  const interventions = WorkflowStore.getAllInterventions();
  const decisions     = WorkflowStore.getAllDecisions();
  const baselineRunId = WorkflowStore.getBaselineRunId();
  const diagnosis     = WorkflowStore.getDiagnosis();

  // ── Guard: only render when at least one candidate is accepted ──
  const acceptedCandidate = candidates.find((c) => c.status === "accepted");

  if (!acceptedCandidate) {
    return (
      <main className="min-h-screen bg-jh-bg p-3 lg:p-4">
        <div className="max-w-[900px] mx-auto space-y-4">
          <div className="border-b border-jh-border-lt pb-3">
            <h2 className="font-sketch text-[1.6rem] font-bold leading-none tracking-wide text-jh-text">
              Calibration Report
            </h2>
            <p className="font-mono text-[11px] text-jh-dim mt-1">
              Full post-acceptance calibration record · read-only
            </p>
          </div>
          <InstrumentPanel label="Report Not Available" accent="warn">
            <div className="py-6 text-center space-y-3">
              <StatusLED status="warning" label="Calibration not yet complete" />
              <p className="font-mono text-[10px] text-jh-dim mt-2">
                The Calibration Report becomes available after a candidate evaluator has been accepted.
              </p>
              <p className="font-mono text-[10px] text-jh-dim">
                Complete the workflow: Diagnose → Intervention → Revalidation → Accept Candidate.
              </p>
              <div className="flex items-center justify-center gap-3 mt-3">
                <Link
                  href="/revalidation"
                  className="font-mono text-[11px] border border-jh-border-lt px-3 py-1.5 hover:border-jh-border transition-colors"
                >
                  Go to Revalidation →
                </Link>
              </div>
            </div>
          </InstrumentPanel>
        </div>
      </main>
    );
  }

  // ── Baseline metrics ──────────────────────────────────────
  const cases    = FixtureRepository.getCases();
  const repCases = cases.filter((c) => c.sampleType === "representative");
  const trgCases = cases.filter((c) => c.sampleType === "targeted_risk");
  const trgFAILCases = trgCases.filter((c) => c.groundTruth === "FAIL");

  const baselineRun = baselineRunId ? RunStore.getRun(baselineRunId) : undefined;
  const baselineIsLive =
    baselineRun?.mode === "live" &&
    (baselineRun.status === "completed" || baselineRun.status === "partial_failure");

  const baselineJudgments = baselineIsLive
    ? liveJudgmentsToJudgments(baselineRun!.judgments)
    : FixtureRepository.getBaselineJudgments();

  const baselineVersion = baselineIsLive
    ? baselineRun!.evaluatorVersion
    : FixtureRepository.getActiveEvaluatorVersion().version;

  const baselineProfile = computeReliabilityProfile(cases, baselineJudgments, baselineVersion);

  // Baseline targeted/risk FAIL detection
  const baselineTrgDetected = trgFAILCases.filter((c) =>
    baselineJudgments.find((j) => j.caseId === c.id && j.predictedLabel === "FAIL")
  ).length;

  // ── Per-attempt data assembly ─────────────────────────────
  // Metrics come exclusively from each candidate's sealed run.
  // Never recomputed with a different rubric. Never fixture fallback.
  const attemptRows: AttemptRow[] = candidates.map((cand, idx) => {
    const run = cand.revalidationRunId ? RunStore.getRun(cand.revalidationRunId) : undefined;
    const runComplete =
      run && (run.status === "completed" || run.status === "partial_failure");

    const profile = runComplete
      ? computeReliabilityProfile(
          cases,
          liveJudgmentsToJudgments(run!.judgments),
          cand.evaluatorVersion
        )
      : null;

    const intervention = interventions.find((i) => i.id === cand.interventionId);
    const decision     = decisions.find((d) => d.candidateId === cand.candidateId) ?? null;

    // Targeted/risk FAIL detection for this attempt
    const trgDetected = runComplete
      ? trgFAILCases.filter((c) =>
          run!.judgments.find((j) => j.caseId === c.id && j.label === "FAIL")
        ).length
      : null;

    // Missed FAILs and false alarms (representative sample only)
    const repMatrix =
      profile && runComplete
        ? classifyCasesForMatrix(repCases, liveJudgmentsToJudgments(run!.judgments))
        : null;

    // Predecessor rubric for diff:
    // Attempt #1 → baseline rubric
    // Attempt #N (N>1) → previous candidate's rubricText
    const predecessorRubricText =
      idx === 0
        ? BASELINE_RUBRIC_TEXT
        : candidates[idx - 1].rubricText;
    const predecessorLabel =
      idx === 0 ? "Baseline" : `Attempt #${candidates[idx - 1].attemptNumber}`;

    return {
      attemptNumber:        cand.attemptNumber,
      candidateId:          cand.candidateId,
      evaluatorVersion:     cand.evaluatorVersion,
      rubricVersion:        cand.rubricVersion,
      rubricText:           cand.rubricText,
      predecessorRubricText,
      predecessorLabel,
      createdAt:            cand.createdAt,
      interventionRationale: intervention?.rationale ?? "—",
      decision:             decision?.decision ?? null,
      decisionRationale:    decision?.rationale ?? null,
      decidedAt:            decision?.decidedAt ?? null,
      metrics: profile
        ? {
            overallAgreement:    profile.overallAgreement,
            failRecall:          profile.perClass.FAIL.recall,
            failPrecision:       profile.perClass.FAIL.precision,
            fp:                  profile.confusionMatrix.FP,
            fn:                  profile.confusionMatrix.FN,
            tp:                  profile.confusionMatrix.TP,
            tn:                  profile.confusionMatrix.TN,
            failRecallCILower:   profile.perClass.FAIL.recallCI.lower,
            failRecallCIUpper:   profile.perClass.FAIL.recallCI.upper,
            sampleN:             profile.sampleN,
          }
        : null,
      trgDetected,
      trgTotal:   trgFAILCases.length,
      runId:      run?.runId ?? null,
      missedFails: repMatrix?.FN ?? [],
      falseAlarms: repMatrix?.FP ?? [],
    };
  });

  // ── Final (accepted) attempt row ──────────────────────────
  const finalRow = attemptRows.find((r) => r.decision === "accepted")!;

  // ── Summary KPIs: delta between baseline and final ────────
  const finalMetrics = finalRow.metrics;
  const deltaOA = finalMetrics
    ? finalMetrics.overallAgreement - baselineProfile.overallAgreement
    : null;
  const deltaFailRecall = finalMetrics
    ? finalMetrics.failRecall - baselineProfile.perClass.FAIL.recall
    : null;

  const rejectedCount = candidates.filter((c) => c.status === "rejected").length;
  const totalAttempts = candidates.length;

  // ── Accepted rubric (for diff) ────────────────────────────
  const finalRubricText = acceptedCandidate.rubricText;

  // ── Render ────────────────────────────────────────────────
  const sign = (v: number) => (v >= 0 ? "+" : "");

  return (
    <main className="min-h-screen bg-jh-bg p-3 lg:p-4">
      <div className="max-w-[960px] mx-auto space-y-5">

        {/* ── Page header ─────────────────────────────────── */}
        <div className="flex items-start justify-between border-b border-jh-border-lt pb-3">
          <div>
            <div className="font-mono text-[9px] text-jh-dim uppercase tracking-[0.18em] mb-0.5">
              Instrument JH-001 · Post-Acceptance Record
            </div>
            <h2 className="font-sketch text-[1.8rem] font-bold leading-none tracking-wide text-jh-text">
              Calibration Report
            </h2>
            <p className="font-mono text-[11px] text-jh-dim mt-1.5">
              Full calibration record for promotion of{" "}
              <span className="text-jh-text">{acceptedCandidate.evaluatorVersion}</span>{" "}
              · read-only · derived from persisted run data
            </p>
          </div>
          <CalibrationSeal status="VALIDATED" />
        </div>

        {/* ── 1. Calibration Summary ───────────────────────── */}
        <InstrumentPanel label="01 · Calibration Summary" accent="ok">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">

            {/* Baseline evaluator */}
            <div className="border border-jh-border-lt p-3 space-y-0.5">
              <div className="font-mono text-[9px] text-jh-dim uppercase tracking-wide">Baseline Evaluator</div>
              <div className="font-mono font-bold text-sm text-jh-text">{baselineVersion}</div>
              <div className="font-mono text-[10px] text-jh-dim">Superseded</div>
            </div>

            {/* Promoted evaluator */}
            <div className="border border-jh-green/50 bg-green-50/10 p-3 space-y-0.5">
              <div className="font-mono text-[9px] text-jh-dim uppercase tracking-wide">Promoted Evaluator</div>
              <div className="font-mono font-bold text-sm text-jh-green">{acceptedCandidate.evaluatorVersion}</div>
              <div className="font-mono text-[10px] text-jh-dim">Active</div>
            </div>

            {/* Attempts */}
            <div className="border border-jh-border-lt p-3 space-y-0.5">
              <div className="font-mono text-[9px] text-jh-dim uppercase tracking-wide">Attempts</div>
              <div className="font-mono font-bold text-2xl text-jh-text tabular-nums">{totalAttempts}</div>
              <div className="font-mono text-[10px] text-jh-dim">{rejectedCount} rejected · 1 accepted</div>
            </div>

            {/* Overall Agreement */}
            <div className="border border-jh-border-lt p-3 space-y-1">
              <div className="font-mono text-[9px] text-jh-dim uppercase tracking-wide">Overall Agreement</div>
              <div className="flex items-baseline gap-3">
                <span className="font-mono font-bold text-sm text-jh-dim">{pct(baselineProfile.overallAgreement)}</span>
                <span className="font-mono text-[10px] text-jh-dim">→</span>
                <span className="font-mono font-bold text-sm text-jh-text">
                  {finalMetrics ? pct(finalMetrics.overallAgreement) : "—"}
                </span>
                {deltaOA !== null && (
                  <span className={`font-mono text-[10px] font-semibold ${deltaOA >= 0 ? "text-jh-green" : "text-jh-red"}`}>
                    {sign(deltaOA)}{pct(deltaOA)}
                  </span>
                )}
              </div>
              <div className="font-mono text-[9px] text-jh-dim">Baseline → Promoted (representative n=60)</div>
            </div>

            {/* FAIL Recall */}
            <div className="border border-jh-border-lt p-3 space-y-1">
              <div className="font-mono text-[9px] text-jh-dim uppercase tracking-wide">FAIL Recall</div>
              <div className="flex items-baseline gap-3">
                <span className="font-mono font-bold text-sm text-jh-red">{pct(baselineProfile.perClass.FAIL.recall)}</span>
                <span className="font-mono text-[10px] text-jh-dim">→</span>
                <span className={`font-mono font-bold text-sm ${finalMetrics && finalMetrics.failRecall >= 0.7 ? "text-jh-green" : "text-jh-red"}`}>
                  {finalMetrics ? pct(finalMetrics.failRecall) : "—"}
                </span>
                {deltaFailRecall !== null && (
                  <span className={`font-mono text-[10px] font-semibold ${deltaFailRecall >= 0 ? "text-jh-green" : "text-jh-red"}`}>
                    {sign(deltaFailRecall)}{pct(deltaFailRecall)}
                  </span>
                )}
              </div>
              <div className="font-mono text-[9px] text-jh-dim">Primary safety indicator (minority class)</div>
            </div>

            {/* FP / FN */}
            <div className="border border-jh-border-lt p-3 space-y-1">
              <div className="font-mono text-[9px] text-jh-dim uppercase tracking-wide">FP / FN (representative)</div>
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-[10px] text-jh-dim">
                  FP {baselineProfile.confusionMatrix.FP} / FN {baselineProfile.confusionMatrix.FN}
                </span>
                <span className="font-mono text-[10px] text-jh-dim">→</span>
                <span className="font-mono text-sm text-jh-text">
                  {finalMetrics
                    ? `FP ${finalMetrics.fp} / FN ${finalMetrics.fn}`
                    : "—"}
                </span>
              </div>
              <div className="font-mono text-[9px] text-jh-dim">Confusion matrix delta</div>
            </div>

            {/* Targeted / risk */}
            <div className="border border-jh-border-lt p-3 space-y-1">
              <div className="font-mono text-[9px] text-jh-dim uppercase tracking-wide">Targeted / Risk FAIL Detection</div>
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-[10px] text-jh-dim">
                  {baseTrgText(baseTrgDetectedVal(baselineTrgDetected, trgFAILCases.length))}
                </span>
                <span className="font-mono text-[10px] text-jh-dim">→</span>
                <span className="font-mono font-bold text-sm text-jh-text">
                  {finalRow.trgDetected !== null
                    ? `${finalRow.trgDetected} / ${finalRow.trgTotal}`
                    : "—"}
                </span>
              </div>
              <div className="font-mono text-[9px] text-jh-dim">Diagnostic only · not population estimates</div>
            </div>

            {/* Diagnosis */}
            {diagnosis && (
              <div className="border border-jh-border-lt p-3 space-y-0.5 sm:col-span-2 lg:col-span-2">
                <div className="font-mono text-[9px] text-jh-dim uppercase tracking-wide">Trigger / Diagnosis</div>
                <div className="font-mono text-[10px] text-jh-text">{diagnosis.triggerId}</div>
                <div className="font-mono text-[10px] text-jh-dim">
                  {diagnosis.category.replace("_", " ")} · {diagnosis.observationNote.slice(0, 100)}
                  {diagnosis.observationNote.length > 100 ? "…" : ""}
                </div>
              </div>
            )}

          </div>
        </InstrumentPanel>

        {/* ── 2. Calibration Trajectory ────────────────────── */}
        <InstrumentPanel label="02 · Calibration Trajectory" noPadding>
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-[10px] border-collapse">
              <thead>
                <tr className="bg-jh-bg/60 border-b border-jh-border-lt text-[9px] text-jh-dim uppercase tracking-[0.1em]">
                  <th className="px-3 py-2 text-left">Attempt</th>
                  <th className="px-3 py-2 text-left">Version</th>
                  <th className="px-3 py-2 text-right">OA</th>
                  <th className="px-3 py-2 text-right">FAIL Recall</th>
                  <th className="px-3 py-2 text-right">FP</th>
                  <th className="px-3 py-2 text-right">FN</th>
                  <th className="px-3 py-2 text-right">Risk FAIL</th>
                  <th className="px-3 py-2 text-center">Decision</th>
                </tr>
              </thead>
              <tbody>
                {/* Baseline row */}
                <tr className="border-b border-jh-border-lt bg-jh-bg/30">
                  <td className="px-3 py-2 text-jh-dim">Baseline</td>
                  <td className="px-3 py-2 text-jh-text">{baselineVersion}</td>
                  <td className="px-3 py-2 text-right text-jh-dim">{pct(baselineProfile.overallAgreement)}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${baselineProfile.perClass.FAIL.recall < 0.7 ? "text-jh-red" : "text-jh-green"}`}>
                    {pct(baselineProfile.perClass.FAIL.recall)}
                  </td>
                  <td className="px-3 py-2 text-right text-jh-dim">{baselineProfile.confusionMatrix.FP}</td>
                  <td className="px-3 py-2 text-right text-jh-dim">{baselineProfile.confusionMatrix.FN}</td>
                  <td className="px-3 py-2 text-right text-jh-dim">
                    {baselineTrgDetected} / {trgFAILCases.length}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className="font-mono text-[9px] text-jh-dim border border-jh-border-lt px-1.5 py-0.5">ACTIVE</span>
                  </td>
                </tr>

                {/* Candidate rows */}
                {attemptRows.map((row) => (
                  <tr
                    key={row.candidateId}
                    className={`border-b border-jh-border-lt ${row.decision === "accepted" ? "bg-green-50/10" : ""}`}
                  >
                    <td className="px-3 py-2 text-jh-dim">#{row.attemptNumber}</td>
                    <td className="px-3 py-2 text-jh-text">{row.evaluatorVersion}</td>
                    <td className="px-3 py-2 text-right text-jh-dim">
                      {row.metrics ? pct(row.metrics.overallAgreement) : "—"}
                    </td>
                    <td className={`px-3 py-2 text-right font-semibold ${
                      !row.metrics ? "text-jh-dim" :
                      row.metrics.failRecall < 0.7 ? "text-jh-red" : "text-jh-green"
                    }`}>
                      {row.metrics ? pct(row.metrics.failRecall) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-jh-dim">
                      {row.metrics ? row.metrics.fp : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-jh-dim">
                      {row.metrics ? row.metrics.fn : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-jh-dim">
                      {row.trgDetected !== null ? `${row.trgDetected} / ${row.trgTotal}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {row.decision === "accepted" && (
                        <span className="font-mono text-[9px] text-jh-green border border-jh-green/50 px-1.5 py-0.5">VALIDATED</span>
                      )}
                      {row.decision === "rejected" && (
                        <span className="font-mono text-[9px] text-jh-red border border-jh-red/40 px-1.5 py-0.5">REJECTED</span>
                      )}
                      {!row.decision && (
                        <span className="font-mono text-[9px] text-jh-dim border border-jh-border-lt px-1.5 py-0.5">PENDING</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </InstrumentPanel>

        {/* ── 3. Baseline vs Final Rubric ─────────────────── */}
        <InstrumentPanel label="03 · Baseline vs Promoted Rubric">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4 font-mono text-[10px] text-jh-dim border border-jh-border-lt px-3 py-2">
              <div>
                <span className="text-[9px] uppercase tracking-wide block mb-0.5">Baseline Rubric</span>
                <span className="text-jh-text">{FixtureRepository.getActiveRubricVersion().version}</span>
                <span className="text-jh-dim ml-2">(immutable — not changed)</span>
              </div>
              <div>
                <span className="text-[9px] uppercase tracking-wide block mb-0.5">Promoted Rubric</span>
                <span className="text-jh-text">{acceptedCandidate.rubricVersion}</span>
                <span className="text-jh-green ml-2">✓ active</span>
              </div>
            </div>
            <RubricDiff
              before={BASELINE_RUBRIC_TEXT}
              after={finalRubricText}
              beforeLabel={`Baseline (${baselineVersion})`}
              afterLabel={`Promoted (${acceptedCandidate.evaluatorVersion})`}
            />
          </div>
        </InstrumentPanel>

        {/* ── 4. Attempt Details (expandable) ─────────────── */}
        <InstrumentPanel label={`04 · Attempt Details — ${totalAttempts} total`} noPadding>
          <div className="p-3">
            <AttemptAccordion rows={attemptRows} />
          </div>
        </InstrumentPanel>

        {/* ── Footer ──────────────────────────────────────── */}
        <div className="flex items-center justify-between pt-1">
          <div className="font-mono text-[10px] text-jh-dim">
            JH-001 · AACI Framework · Calibration Report · Read-Only
          </div>
          <Link
            href="/history"
            className="font-mono text-[10px] text-jh-dim hover:text-jh-text transition-colors"
          >
            Service Record →
          </Link>
        </div>

      </div>
    </main>
  );
}

// ── Small inline helpers (avoid repeating inline ternaries) ──

function baseTrgDetectedVal(detected: number, total: number): string {
  return `${detected} / ${total}`;
}

function baseTrgText(val: string): string {
  return val;
}

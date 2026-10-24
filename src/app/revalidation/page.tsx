// ============================================================
// Judge Health — Revalidation Screen
//
// Side-by-side comparison of the baseline (active) evaluator
// vs the candidate (proposed) evaluator.
//
// Milestone 3: candidate comes from WorkflowStore (created by
// the Intervention step), not from fixture pre-population.
// If no candidate exists, shows a workflow guidance panel.
//
// Server component — passes data to RevalidationClient.
// ============================================================
import { FixtureRepository } from "@/data/fixture-repository";
import { WorkflowStore } from "@/data/workflow-store";
import { RunStore, liveJudgmentsToJudgments } from "@/data/run-store";
import { computeReliabilityProfile, classifyCasesForMatrix, pct } from "@/core/metrics";
import type { MatrixCaseLists, MatrixCellCase } from "@/components/ClickableConfusionMatrix";
import type { Label } from "@/core/types";
import { InstrumentPanel } from "@/components/instrument/InstrumentPanel";
import { StatusLED } from "@/components/instrument/StatusLED";
import { ConfusionMatrixDisplay } from "@/components/confusion-matrix";
import { ClickableConfusionMatrix } from "@/components/ClickableConfusionMatrix";
import { RevalidationClient } from "@/components/RevalidationClient";
import { LiveRunPanel } from "@/components/LiveRunPanel";

import { activeWorkspace } from "@/data/experiment-store";
import { ExperimentRevalidation } from "@/components/ExperimentRevalidation";

export default function RevalidationPage() {
  const workspace = activeWorkspace();
  if (workspace.mode === "configured") {
    return <ExperimentRevalidation experiment={workspace.experiment} />;
  }
  // ── Baseline (active) evaluator ───────────────────────────
  const cases          = FixtureRepository.getCases();
  const activeVersion  = FixtureRepository.getActiveEvaluatorVersion();
  const activeRubric   = FixtureRepository.getActiveRubricVersion();
  const activeTaxonomy = FixtureRepository.getActiveTaxonomyVersion();

  // Live runs override fixture data when available.
  // INVARIANT: derive runs by stored ID, never by "most recent by type".
  // The candidate run is sourced from CandidateRecord.revalidationRunId,
  // ensuring Candidate #2 can never display Candidate #1's results.
  const baselineRunId    = WorkflowStore.getBaselineRunId();
  const candidateRunId   = WorkflowStore.getCurrentCandidateRunId();
  const liveBaselineRun  = baselineRunId  ? RunStore.getRun(baselineRunId)  : undefined;
  const liveCandidateRun = candidateRunId ? RunStore.getRun(candidateRunId) : undefined;

  const baselineIsLive = liveBaselineRun?.mode === "live" &&
    (liveBaselineRun.status === "completed" || liveBaselineRun.status === "partial_failure");
  const candidateIsLive = liveCandidateRun?.mode === "live" &&
    (liveCandidateRun.status === "completed" || liveCandidateRun.status === "partial_failure");

  const baselineJudgments = baselineIsLive
    ? liveJudgmentsToJudgments(liveBaselineRun!.judgments)
    : FixtureRepository.getBaselineJudgments();

  const baselineVersionLabel = baselineIsLive
    ? liveBaselineRun!.evaluatorVersion
    : activeVersion.version;

  const baselineProfile = computeReliabilityProfile(
    cases, baselineJudgments, baselineVersionLabel
  );

  // ── Candidate from WorkflowStore (multi-attempt) ─────────
  const currentCandidate     = WorkflowStore.getCurrentCandidate();
  const revalidationDecision = WorkflowStore.getCurrentDecision();

  // ── Guard: no candidate yet → show guidance ───────────────
  if (!currentCandidate) {
    const diagnosis    = WorkflowStore.getDiagnosis();
    const intervention = WorkflowStore.getCurrentIntervention();

    return (
      <main className="min-h-screen bg-jh-bg p-3 lg:p-4">
        <div className="max-w-[900px] mx-auto space-y-4">
          <div className="border-b border-jh-border-lt pb-3">
            <h2 className="font-sketch text-[1.6rem] font-bold leading-none tracking-wide text-jh-text">
              Revalidation
            </h2>
            <p className="font-mono text-[11px] text-jh-dim mt-1">
              Candidate vs. baseline evaluation · Accept or reject to update instrument calibration.
            </p>
          </div>

          <InstrumentPanel label="Workflow Incomplete" accent="error">
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-3">
                <StatusLED status="error" />
                <span className="font-mono text-[11px] text-jh-red font-semibold">
                  No candidate evaluator version available
                </span>
              </div>
              <p className="font-mono text-[10px] text-jh-dim leading-relaxed">
                A candidate is created when you complete the workflow:
                Diagnose → Intervention → Create Candidate. Navigate to each step
                and complete it to unlock revalidation.
              </p>
              <div className="border border-jh-border-lt bg-jh-bg/40 p-3 space-y-2 font-mono text-[10px]">
                {[
                  {
                    step: "1. Diagnosis",
                    done: diagnosis !== null,
                    href: "/diagnose",
                    cta: "Go to Diagnose",
                  },
                  {
                    step: "2. Intervention",
                    done: intervention !== null,
                    href: "/intervention",
                    cta: "Go to Intervention",
                  },
                  {
                    step: "3. Create Candidate",
                    done: false,
                    href: intervention ? "/intervention" : "/diagnose",
                    cta: "Complete Intervention",
                  },
                ].map(({ step, done, href, cta }) => (
                  <div key={step} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${done ? "bg-jh-led-green" : "bg-jh-border-lt"}`} />
                      <span className={done ? "text-jh-green" : "text-jh-dim"}>{step}</span>
                    </div>
                    {!done && (
                      <a href={href} className="text-jh-text border border-jh-border-lt px-2 py-0.5 hover:border-jh-border transition-colors">
                        {cta} →
                      </a>
                    )}
                    {done && (
                      <span className="text-jh-green">✓ complete</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </InstrumentPanel>
        </div>
      </main>
    );
  }

  // ── Candidate judgments ───────────────────────────────────
  // INVARIANT: candidate metrics only exist after a completed live candidate run.
  // No fixture fallback in live mode — showing fixture candidate metrics before
  // a real run would make invalid performance claims.
  const candidateVersionLabel = candidateIsLive
    ? liveCandidateRun!.evaluatorVersion
    : currentCandidate.evaluatorVersion;

  const candidateProfile = candidateIsLive
    ? computeReliabilityProfile(
        cases,
        liveJudgmentsToJudgments(liveCandidateRun!.judgments),
        candidateVersionLabel
      )
    : null;

  // ── Intervention rubric (the changed variable) ────────────
  const intervention = WorkflowStore.getCurrentIntervention();
  const candidateRubricText = intervention?.proposedRubricText ?? currentCandidate.rubricText ?? "";

  // ── Case lists for clickable confusion matrices ────────────
  // Only representative cases feed population metrics.
  const repCases = cases.filter((c) => c.sampleType === "representative");

  function enrichCellCases(ids: string[], gt: Label, pred: Label): MatrixCellCase[] {
    return ids.map((id) => ({
      caseId: id,
      inputPreview: FixtureRepository.getCaseContent(id)?.input.slice(0, 90) ?? "—",
      groundTruth: gt,
      predicted: pred,
    }));
  }

  function buildMatrixCaseLists(
    ids: ReturnType<typeof classifyCasesForMatrix>
  ): MatrixCaseLists {
    return {
      TP: enrichCellCases(ids.TP, "FAIL", "FAIL"),
      FP: enrichCellCases(ids.FP, "PASS", "FAIL"),
      TN: enrichCellCases(ids.TN, "PASS", "PASS"),
      FN: enrichCellCases(ids.FN, "FAIL", "PASS"),
    };
  }

  const baselineJudgmentsForMatrix = baselineIsLive
    ? liveJudgmentsToJudgments(liveBaselineRun!.judgments)
    : FixtureRepository.getBaselineJudgments();
  const baselineCaseLists = buildMatrixCaseLists(
    classifyCasesForMatrix(repCases, baselineJudgmentsForMatrix)
  );

  const candidateCaseLists: MatrixCaseLists | null = candidateIsLive
    ? buildMatrixCaseLists(
        classifyCasesForMatrix(repCases, liveJudgmentsToJudgments(liveCandidateRun!.judgments))
      )
    : null;

  // ── Representative regression analysis ────────────────────
  // Compare baseline vs candidate label for each representative case.
  // Used in: (1) REPRESENTATIVE REGRESSIONS panel, (2) pre-Accept alert.
  type RepChange = "new_miss" | "new_alarm" | "fixed_miss" | "fixed_alarm";
  type RepRow = {
    caseId: string;
    inputPreview: string;
    groundTruth: Label;
    bLabel: Label;
    candLabel: Label;
    change: RepChange;
  };

  const repRegressionRows: RepRow[] = [];
  if (candidateIsLive && liveBaselineRun && liveCandidateRun) {
    const bMap = new Map(liveBaselineRun.judgments.map((j) => [j.caseId, j.label]));
    const cMap = new Map(liveCandidateRun.judgments.map((j) => [j.caseId, j.label]));

    for (const c of repCases) {
      const b    = bMap.get(c.id);
      const cand = cMap.get(c.id);
      if (!b || !cand || b === cand) continue;

      let change: RepChange | null = null;
      if (c.groundTruth === "FAIL" && b === "FAIL" && cand === "PASS") change = "new_miss";
      else if (c.groundTruth === "PASS" && b === "PASS" && cand === "FAIL") change = "new_alarm";
      else if (c.groundTruth === "FAIL" && b === "PASS" && cand === "FAIL") change = "fixed_miss";
      else if (c.groundTruth === "PASS" && b === "FAIL" && cand === "PASS") change = "fixed_alarm";

      if (change) {
        repRegressionRows.push({
          caseId: c.id,
          inputPreview: FixtureRepository.getCaseContent(c.id)?.input.slice(0, 80) ?? "—",
          groundTruth: c.groundTruth,
          bLabel: b,
          candLabel: cand,
          change,
        });
      }
    }
  }

  const repNewMisses   = repRegressionRows.filter((r) => r.change === "new_miss");
  const repNewAlarms   = repRegressionRows.filter((r) => r.change === "new_alarm");
  const repFixedMisses = repRegressionRows.filter((r) => r.change === "fixed_miss");
  const repFixedAlarms = repRegressionRows.filter((r) => r.change === "fixed_alarm");

  // ── All case IDs for revalidation run (rep + targeted/risk) ──
  const repCaseIds = cases.filter((c) => c.sampleType === "representative").map((c) => c.id);
  const trgCaseIds = cases.filter((c) => c.sampleType === "targeted_risk").map((c) => c.id);
  const allCaseIds = [...repCaseIds, ...trgCaseIds];
  const liveModel  = process.env.OPENAI_EVALUATOR_MODEL ?? "gpt-5.6-luna";

  // ── Gates ─────────────────────────────────────────────────
  const liveRunsComplete = baselineIsLive && candidateIsLive;

  // ── Deltas (only when candidate profile exists) ───────────
  const bF = baselineProfile.perClass.FAIL;
  const bP = baselineProfile.perClass.PASS;
  const cF = candidateProfile?.perClass.FAIL;
  const cP = candidateProfile?.perClass.PASS;

  const delta = candidateProfile ? {
    agreement:  candidateProfile.overallAgreement - baselineProfile.overallAgreement,
    failRecall: cF!.recall     - bF.recall,
    failPrec:   cF!.precision  - bF.precision,
    passRecall: cP!.recall     - bP.recall,
    failFNR:    cF!.falseNegativeRate - bF.falseNegativeRate,
  } : null;

  function sign(v: number) { return v >= 0 ? "+" : ""; }
  function deltaClass(v: number, higherIsBetter = true) {
    if (Math.abs(v) < 0.001) return "text-jh-dim";
    const better = higherIsBetter ? v > 0 : v < 0;
    return better ? "text-jh-green font-semibold" : "text-jh-red font-semibold";
  }

  return (
    <main className="min-h-screen bg-jh-bg p-3 lg:p-4">
      <div className="max-w-[1100px] mx-auto space-y-4">

        {/* ── Calibration run identity ──────────────────────── */}
        <div className="border-b border-jh-border-lt pb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-mono text-[9px] text-jh-dim uppercase tracking-[0.18em] mb-0.5">
                Calibration Run
              </div>
              <h2 className="font-sketch text-[2rem] font-bold leading-none tracking-wide text-jh-text">
                #0001
              </h2>
              <p className="font-mono text-[11px] text-jh-dim mt-1.5">
                Candidate vs. baseline evaluation · Accept or reject to update instrument calibration.
              </p>
            </div>

            <div className="hidden sm:block font-mono text-[10px] border border-jh-border-lt bg-jh-panel p-3 space-y-1 shrink-0">
              <div className="text-[9px] text-jh-dim uppercase tracking-[0.15em] mb-1.5">
                Run Parameters
              </div>
              {[
                { label: "Instrument",    value: "JH-001" },
                { label: "Reference Set", value: "RS-003" },
                { label: "Sample",        value: `n=${baselineProfile.sampleN}` },
                { label: "Date",          value: new Date().toISOString().slice(0, 10) },
                {
                  label: "Status",
                  value: revalidationDecision
                    ? revalidationDecision.decision.toUpperCase()
                    : "UNDER REVIEW",
                },
              ].map(({ label, value }) => (
                <div key={label} className="flex gap-3">
                  <span className="text-jh-dim w-28 shrink-0">{label}</span>
                  <span className="text-jh-text">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {baselineIsLive ? (
              <span className="font-mono text-[10px] border border-jh-green/60 text-jh-green inline-flex items-center gap-1.5 px-2 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-jh-led-green inline-block" />
                LIVE BASELINE · {liveBaselineRun?.model}
              </span>
            ) : (
              <span className="font-mono text-[10px] text-jh-dim border border-jh-border-lt inline-flex items-center gap-2 px-2 py-1">
                FIXTURE BASELINE
              </span>
            )}
            {candidateIsLive ? (
              <span className="font-mono text-[10px] border border-jh-green/60 text-jh-green inline-flex items-center gap-1.5 px-2 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-jh-led-green inline-block" />
                LIVE CANDIDATE · {liveCandidateRun?.model}
              </span>
            ) : (
              <span className="font-mono text-[10px] text-jh-amber border border-jh-amber/40 inline-flex items-center gap-1.5 px-2 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-jh-led-amber inline-block" />
                CANDIDATE · NOT YET EVALUATED
              </span>
            )}
          </div>
        </div>

        {/* ── Version banner ─────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          {/* Baseline */}
          <div className="border border-jh-border bg-jh-panel p-3 space-y-1">
            <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-jh-dim">
              Baseline · Active
            </div>
            <div className="font-mono text-base font-bold text-jh-text">{activeVersion.version}</div>
            <div className="flex items-center gap-2">
              <StatusLED status="ok" size="sm" />
              <span className="font-mono text-[10px] text-jh-green">ACTIVE</span>
            </div>
            <div className="font-mono text-[9px] text-jh-dim">
              Rubric {activeRubric.version} · Taxonomy {activeTaxonomy.version}
            </div>
            {activeVersion.changeDescription && (
              <div className="pt-1 border-t border-jh-border-lt font-mono text-[9px] text-jh-dim">
                {activeVersion.changeDescription}
              </div>
            )}
          </div>

          {/* Candidate */}
          <div className={`border bg-jh-panel p-3 space-y-1 ${
            revalidationDecision?.decision === "accepted" ? "border-jh-green/60" :
            revalidationDecision?.decision === "rejected" ? "border-jh-red/60" :
            "border-jh-amber/60"
          }`}>
            <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-jh-dim">
              Candidate ·{" "}
              {revalidationDecision
                ? revalidationDecision.decision === "accepted" ? "Accepted" : "Rejected"
                : "Under Review"}
            </div>
            <div className="font-mono text-base font-bold text-jh-text">{currentCandidate.evaluatorVersion}</div>
            <div className="flex items-center gap-2">
              <StatusLED
                status={
                  revalidationDecision?.decision === "accepted" ? "ok" :
                  revalidationDecision?.decision === "rejected" ? "error" :
                  "warning"
                }
                size="sm"
              />
              <span className={`font-mono text-[10px] ${
                revalidationDecision?.decision === "accepted" ? "text-jh-green" :
                revalidationDecision?.decision === "rejected" ? "text-jh-red" :
                "text-jh-amber"
              }`}>
                {revalidationDecision
                  ? revalidationDecision.decision.toUpperCase()
                  : "CANDIDATE"}
              </span>
            </div>
            <div className="font-mono text-[9px] text-jh-dim">
              Rubric {currentCandidate.rubricVersion} · Taxonomy {currentCandidate.taxonomyVersion}
            </div>
            {currentCandidate.rubricText && (
              <div className="pt-1 border-t border-jh-border-lt font-mono text-[9px] text-jh-dim">
                Attempt #{currentCandidate.attemptNumber}
              </div>
            )}
          </div>
        </div>

        {/* ── Metric comparison table ─────────────────────────── */}
        <InstrumentPanel label="Metric Comparison — Baseline vs. Candidate" noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] font-mono">
              <thead>
                <tr className="border-b border-jh-border bg-jh-bg/60 text-jh-dim">
                  <th className="text-left px-3 py-2 font-normal uppercase tracking-[0.12em]">Metric</th>
                  <th className="text-right px-3 py-2 font-normal uppercase tracking-[0.12em]">Baseline</th>
                  <th className="text-right px-3 py-2 font-normal uppercase tracking-[0.12em]">Candidate</th>
                  <th className="text-right px-3 py-2 font-normal uppercase tracking-[0.12em]">Δ Delta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-jh-border-lt">
                {[
                  {
                    metric: "Overall Agreement",
                    base: pct(baselineProfile.overallAgreement),
                    cand: candidateProfile ? pct(candidateProfile.overallAgreement) : null,
                    d: delta?.agreement,
                    better: true,
                  },
                  {
                    metric: "FAIL Recall (sensitivity)",
                    base: pct(bF.recall),
                    cand: cF ? pct(cF.recall) : null,
                    d: delta?.failRecall,
                    better: true,
                    highlight: true,
                  },
                  {
                    metric: "FAIL Precision",
                    base: pct(bF.precision),
                    cand: cF ? pct(cF.precision) : null,
                    d: delta?.failPrec,
                    better: true,
                  },
                  {
                    metric: "FAIL False Negative Rate",
                    base: pct(bF.falseNegativeRate),
                    cand: cF ? pct(cF.falseNegativeRate) : null,
                    d: delta?.failFNR,
                    better: false,
                  },
                  {
                    metric: "PASS Recall",
                    base: pct(bP.recall),
                    cand: cP ? pct(cP.recall) : null,
                    d: delta?.passRecall,
                    better: true,
                  },
                  {
                    metric: "PASS Precision",
                    base: pct(bP.precision),
                    cand: cP ? pct(cP.precision) : null,
                    d: null,
                    better: true,
                  },
                ].map(({ metric, base, cand, d, better, highlight }) => (
                  <tr key={metric} className={highlight ? "bg-red-50/10" : ""}>
                    <td className={`px-3 py-2 ${highlight ? "font-semibold" : ""}`}>{metric}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{base}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${!cand ? "text-jh-border-mid" : ""}`}>
                      {cand ?? "—"}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${d != null ? deltaClass(d, better) : "text-jh-border-mid"}`}>
                      {d != null ? `${sign(d)}${pct(d)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-1.5 border-t border-jh-border-lt bg-jh-bg/40 font-mono text-[9px] text-jh-dim">
            {candidateProfile
              ? `Positive delta = candidate improves on baseline. Rep. sample n=${baselineProfile.sampleN}.`
              : "Run Live Revalidation to populate candidate metrics and deltas."}
          </div>
        </InstrumentPanel>

        {/* ── Confusion matrices — clickable ─────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <InstrumentPanel label={`Confusion Matrix — ${baselineVersionLabel} (${baselineIsLive ? "LIVE" : "FIXTURE"} Baseline)`}>
            <ClickableConfusionMatrix
              matrix={baselineProfile.confusionMatrix}
              caseLists={baselineCaseLists}
            />
          </InstrumentPanel>
          <InstrumentPanel label={`Confusion Matrix — ${candidateVersionLabel} (${candidateIsLive ? "LIVE" : "NOT EVALUATED"})`}>
            {candidateProfile && candidateCaseLists ? (
              <ClickableConfusionMatrix
                matrix={candidateProfile.confusionMatrix}
                caseLists={candidateCaseLists}
              />
            ) : (
              <div className="flex items-center justify-center py-8 font-mono text-[11px] text-jh-border-mid">
                — not evaluated —
              </div>
            )}
          </InstrumentPanel>
        </div>

        {/* ── Representative Regressions ─────────────────────── */}
        {candidateIsLive && repRegressionRows.length > 0 && (
          <InstrumentPanel
            label={`Representative Regressions — Baseline vs. Candidate — n=${repCases.length} rep`}
            noPadding
          >
            {/* Diagnostic notice */}
            <div className="px-3 py-1.5 border-b border-jh-border-lt bg-jh-bg/40 font-mono text-[10px] text-jh-dim">
              Changes between baseline and candidate on the representative sample · population-level evidence
            </div>

            {/* Summary strip */}
            <div className="grid grid-cols-4 divide-x divide-jh-border-lt border-b border-jh-border-lt">
              {[
                {
                  label: "New missed FAILs",
                  count: repNewMisses.length,
                  color: repNewMisses.length > 0 ? "text-jh-red font-bold" : "text-jh-dim",
                  icon: repNewMisses.length > 0 ? "⚠" : "—",
                },
                {
                  label: "New false alarms",
                  count: repNewAlarms.length,
                  color: repNewAlarms.length > 0 ? "text-jh-amber font-semibold" : "text-jh-dim",
                  icon: repNewAlarms.length > 0 ? "▲" : "—",
                },
                {
                  label: "Fixed misses",
                  count: repFixedMisses.length,
                  color: repFixedMisses.length > 0 ? "text-jh-green" : "text-jh-dim",
                  icon: repFixedMisses.length > 0 ? "✓" : "—",
                },
                {
                  label: "Fixed alarms",
                  count: repFixedAlarms.length,
                  color: repFixedAlarms.length > 0 ? "text-jh-green" : "text-jh-dim",
                  icon: repFixedAlarms.length > 0 ? "✓" : "—",
                },
              ].map(({ label, count, color, icon }) => (
                <div key={label} className="px-4 py-2">
                  <div className="font-mono text-[9px] text-jh-dim uppercase tracking-wide mb-0.5">{label}</div>
                  <div className={`font-mono font-bold text-sm ${color}`}>
                    {icon} {count}
                  </div>
                </div>
              ))}
            </div>

            {/* Case table — only changed cases, sorted by severity */}
            <table className="w-full text-[10px] font-mono">
              <thead>
                <tr className="border-b border-jh-border bg-jh-bg/60 text-jh-dim text-[9px] uppercase tracking-[0.1em]">
                  <th className="text-left px-3 py-1.5 font-normal">Case ID</th>
                  <th className="text-left px-3 py-1.5 font-normal">Input preview</th>
                  <th className="text-center px-2 py-1.5 font-normal">Truth</th>
                  <th className="text-center px-2 py-1.5 font-normal">Baseline</th>
                  <th className="text-center px-2 py-1.5 font-normal">Candidate</th>
                  <th className="text-left px-3 py-1.5 font-normal">Change</th>
                  <th className="px-2 py-1.5 font-normal" />
                </tr>
              </thead>
              <tbody>
                {/* Sort: new_miss first (worst), then new_alarm, fixed_miss, fixed_alarm */}
                {[...repRegressionRows]
                  .sort((a, b) => {
                    const order: Record<RepChange, number> = {
                      new_miss: 0, new_alarm: 1, fixed_miss: 2, fixed_alarm: 3,
                    };
                    return order[a.change] - order[b.change];
                  })
                  .map((row) => {
                    const rowBg =
                      row.change === "new_miss"   ? "bg-red-50/25" :
                      row.change === "new_alarm"  ? "bg-amber-50/15" :
                      row.change === "fixed_miss" ? "bg-green-50/15" : "";
                    return (
                      <tr key={row.caseId} className={`border-b border-jh-border-lt ${rowBg}`}>
                        <td className="px-3 py-2 whitespace-nowrap text-jh-text">{row.caseId}</td>
                        <td className="px-3 py-2 text-jh-dim max-w-[220px]">
                          <span className="line-clamp-1">{row.inputPreview}</span>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span className={row.groundTruth === "FAIL" ? "text-jh-red font-semibold" : "text-jh-green"}>
                            {row.groundTruth}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span className={row.bLabel === "FAIL" ? "text-jh-red" : "text-jh-dim"}>{row.bLabel}</span>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span className={row.candLabel === "FAIL" ? "text-jh-red" : "text-jh-dim"}>{row.candLabel}</span>
                        </td>
                        <td className="px-3 py-2">
                          {row.change === "new_miss"   && <span className="text-jh-red font-semibold">⚠ FAIL→PASS · new miss</span>}
                          {row.change === "new_alarm"  && <span className="text-jh-amber">▲ PASS→FAIL · new alarm</span>}
                          {row.change === "fixed_miss" && <span className="text-jh-green">✓ PASS→FAIL · miss fixed</span>}
                          {row.change === "fixed_alarm"&& <span className="text-jh-green">✓ FAIL→PASS · alarm fixed</span>}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <a
                            href={`/evidence/${row.caseId}?from=revalidation`}
                            className="text-jh-dim border border-jh-border-lt px-2 py-0.5 hover:text-jh-text hover:border-jh-border transition-colors whitespace-nowrap"
                          >
                            Review →
                          </a>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </InstrumentPanel>
        )}

        {/* ── Targeted / Risk — Baseline vs Candidate ──────────── */}
        {candidateIsLive && liveBaselineRun && liveCandidateRun && (() => {
          const trgCases = cases.filter((c) => c.sampleType === "targeted_risk");
          const trgFail  = trgCases.filter((c) => c.groundTruth === "FAIL");
          const trgPass  = trgCases.filter((c) => c.groundTruth === "PASS");

          const baselineMap  = new Map(liveBaselineRun.judgments.map((j) => [j.caseId, j]));
          const candidateMap = new Map(liveCandidateRun.judgments.map((j) => [j.caseId, j]));

          const rows = trgCases.map((c) => {
            const bj        = baselineMap.get(c.id);
            const cj        = candidateMap.get(c.id);
            const content   = FixtureRepository.getCaseContent(c.id);
            const baseLabel = bj?.label ?? null;
            const candLabel = cj?.label ?? null;
            // For reference-FAIL cases: FAIL→PASS = new miss (regression)
            // For reference-PASS cases: PASS→FAIL = new false alarm
            const change =
              c.groundTruth === "FAIL" && baseLabel === "FAIL" && candLabel === "PASS" ? "new_miss"
              : c.groundTruth === "FAIL" && baseLabel === "PASS" && candLabel === "FAIL" ? "fixed_miss"
              : c.groundTruth === "PASS" && baseLabel === "PASS" && candLabel === "FAIL" ? "new_alarm"
              : c.groundTruth === "PASS" && baseLabel === "FAIL" && candLabel === "PASS" ? "fixed_alarm"
              : baseLabel === candLabel ? "same"
              : "pending";
            return { c, baseLabel, candLabel, change, content };
          });

          // ── Computed stats ──────────────────────────────────
          const baselineCaughtFail  = trgFail.filter((c) => baselineMap.get(c.id)?.label === "FAIL").length;
          const candidateCaughtFail = trgFail.filter((c) => candidateMap.get(c.id)?.label === "FAIL").length;
          const newMisses   = rows.filter((r) => r.change === "new_miss");
          const fixedMisses = rows.filter((r) => r.change === "fixed_miss");
          const newAlarms   = rows.filter((r) => r.change === "new_alarm");
          const evaluated   = rows.filter((r) => r.baseLabel && r.candLabel).length;

          return (
            <>
            <InstrumentPanel
              label={`Targeted / Risk — Baseline vs Candidate — N=${trgCases.length}`}
              noPadding
            >
              {/* Diagnostic notice */}
              <div className="px-3 py-1.5 border-b border-jh-border-lt bg-amber-50/20 font-mono text-[10px] text-jh-amber">
                Diagnostic evidence only — excluded from population reliability metrics. · {evaluated}/{trgCases.length} evaluated
              </div>

              {/* Composed stats — reference FAIL */}
              <div className="grid grid-cols-3 divide-x divide-jh-border-lt border-b border-jh-border-lt">
                <div className="px-4 py-2 space-y-0.5">
                  <div className="font-mono text-[9px] text-jh-dim uppercase tracking-wide">Baseline · ref-FAIL</div>
                  <div className="font-mono font-bold text-sm text-jh-text">
                    {baselineCaughtFail}/{trgFail.length} <span className="text-[10px] font-normal text-jh-dim">detected</span>
                  </div>
                </div>
                <div className="px-4 py-2 space-y-0.5">
                  <div className="font-mono text-[9px] text-jh-dim uppercase tracking-wide">Candidate · ref-FAIL</div>
                  <div className={`font-mono font-bold text-sm ${candidateCaughtFail < baselineCaughtFail ? "text-jh-red" : candidateCaughtFail > baselineCaughtFail ? "text-jh-green" : "text-jh-text"}`}>
                    {candidateCaughtFail}/{trgFail.length} <span className="text-[10px] font-normal text-jh-dim">detected</span>
                  </div>
                </div>
                <div className="px-4 py-2 space-y-0.5 font-mono text-[10px]">
                  <div className="text-[9px] text-jh-dim uppercase tracking-wide mb-1">Composition change</div>
                  {fixedMisses.length > 0 && (
                    <div className="text-jh-green">✓ {fixedMisses.length} previous miss{fixedMisses.length > 1 ? "es" : ""} fixed</div>
                  )}
                  {newMisses.length > 0 && (
                    <div className="text-jh-red font-semibold">⚠ {newMisses.length} new miss{newMisses.length > 1 ? "es" : ""} introduced</div>
                  )}
                  {newAlarms.length > 0 && (
                    <div className="text-jh-amber">▲ {newAlarms.length} new false alarm{newAlarms.length > 1 ? "s" : ""}</div>
                  )}
                  {fixedMisses.length === 0 && newMisses.length === 0 && newAlarms.length === 0 && (
                    <div className="text-jh-dim">No changes in detection</div>
                  )}
                </div>
              </div>

              {/* Case table */}
              <table className="w-full text-[10px] font-mono">
                <thead>
                  <tr className="border-b border-jh-border bg-jh-bg/60 text-jh-dim text-[9px] uppercase tracking-[0.1em]">
                    <th className="text-left px-3 py-1.5 font-normal">Case ID</th>
                    <th className="text-left px-3 py-1.5 font-normal">Input preview</th>
                    <th className="text-center px-2 py-1.5 font-normal">Truth</th>
                    <th className="text-center px-2 py-1.5 font-normal">Baseline</th>
                    <th className="text-center px-2 py-1.5 font-normal">Candidate</th>
                    <th className="text-left px-3 py-1.5 font-normal">Change</th>
                    <th className="px-2 py-1.5 font-normal" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ c, baseLabel, candLabel, change, content }) => {
                    const rowBg =
                      change === "new_miss"   ? "bg-red-50/30" :
                      change === "new_alarm"  ? "bg-amber-50/20" :
                      change === "fixed_miss" ? "bg-green-50/20" : "";
                    return (
                      <tr key={c.id} className={`border-b border-jh-border-lt ${rowBg}`}>
                        <td className="px-3 py-2 whitespace-nowrap text-jh-text">{c.id}</td>
                        <td className="px-3 py-2 text-jh-dim max-w-[220px]">
                          <span className="line-clamp-1">{content?.input.slice(0, 80) ?? "—"}</span>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span className={c.groundTruth === "FAIL" ? "text-jh-red font-semibold" : "text-jh-green"}>
                            {c.groundTruth}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span className={baseLabel === "FAIL" ? "text-jh-red" : baseLabel === "PASS" ? "text-jh-dim" : "text-jh-border-mid"}>
                            {baseLabel ?? "—"}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span className={candLabel === "FAIL" ? "text-jh-red" : candLabel === "PASS" ? "text-jh-dim" : "text-jh-border-mid"}>
                            {candLabel ?? "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-[10px]">
                          {change === "new_miss"   && <span className="text-jh-red font-semibold">⚠ FAIL→PASS · new miss</span>}
                          {change === "fixed_miss" && <span className="text-jh-green">✓ PASS→FAIL · miss fixed</span>}
                          {change === "new_alarm"  && <span className="text-jh-amber">▲ PASS→FAIL · new alarm</span>}
                          {change === "fixed_alarm"&& <span className="text-jh-green">✓ FAIL→PASS · alarm fixed</span>}
                          {change === "same"       && <span className="text-jh-dim">— unchanged ({baseLabel})</span>}
                          {change === "pending"    && <span className="text-jh-border-mid">—</span>}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <a
                            href={`/evidence/${c.id}?from=revalidation`}
                            className="font-mono text-[10px] text-jh-dim border border-jh-border-lt px-2 py-0.5 hover:text-jh-text hover:border-jh-border transition-colors whitespace-nowrap"
                          >
                            Review →
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </InstrumentPanel>

            {/* ── Regression warning above Analyst Decision ── */}
            {newMisses.length > 0 && (
              <div className="border border-jh-red/60 bg-red-50/15 px-4 py-3 font-mono text-[10px] space-y-1.5">
                <div className="flex items-center gap-2 text-jh-red font-semibold text-[11px]">
                  <span>⚠</span>
                  <span>TARGETED/RISK REGRESSION DETECTED</span>
                </div>
                <div className="text-jh-red">
                  Candidate introduced {newMisses.length} new missed-risk case{newMisses.length > 1 ? "s" : ""}:{" "}
                  <span className="font-semibold">{newMisses.map((r) => r.c.id).join(", ")}</span>.
                </div>
                <div className="text-jh-dim leading-relaxed">
                  Targeted/risk evidence is diagnostic only and excluded from population reliability metrics.
                  Review these cases before accepting the candidate.
                </div>
              </div>
            )}
            </>
          );
        })()}

        {/* ── Live candidate run panel (shown when no run, or partial_failure needs retry) ── */}
        {(!candidateIsLive || liveCandidateRun?.status === "partial_failure") && (
          <div className="space-y-2">
            <div className="font-mono text-[10px] text-jh-dim border-b border-jh-border-lt pb-2">
              Live Revalidation — same model, same cases, same reference labels · candidate rubric applied as intervention
            </div>
            <LiveRunPanel
              type="candidate"
              sampleCaseIds={allCaseIds}
              rubricText={candidateRubricText}
              evaluatorVersion={currentCandidate.evaluatorVersion}
              rubricVersion={currentCandidate.rubricVersion}
              taxonomyVersion={currentCandidate.taxonomyVersion}
              model={liveModel}
              existingRun={liveCandidateRun ?? undefined}
              readOnly
            />
          </div>
        )}

        {/* ── Representative regression alert (pre-Accept) ─── */}
        {candidateIsLive && repNewMisses.length > 0 && (
          <div className="border border-jh-red/60 bg-red-50/15 px-4 py-3 font-mono text-[10px] space-y-1.5">
            <div className="flex items-center gap-2 text-jh-red font-semibold text-[11px]">
              <span>⚠</span>
              <span>REPRESENTATIVE REGRESSION DETECTED</span>
            </div>
            <div className="text-jh-red">
              Candidate introduced {repNewMisses.length} new missed-FAIL case{repNewMisses.length > 1 ? "s" : ""} in the representative sample:{" "}
              <span className="font-semibold">{repNewMisses.map((r) => r.caseId).join(", ")}</span>.
            </div>
            <div className="text-jh-dim leading-relaxed">
              Unlike targeted/risk regressions, this affects the population reliability estimate.
              A new missed FAIL in the representative sample is a direct reduction in FAIL recall.
              Review these cases before accepting.
            </div>
          </div>
        )}

        {/* ── Accept / Reject decision (client) ─────────────── */}
        <RevalidationClient
          candidateId={currentCandidate.candidateId}
          baselineVersion={baselineVersionLabel}
          candidateVersion={candidateVersionLabel}
          deltaFailRecall={delta?.failRecall ?? 0}
          existingDecision={revalidationDecision}
          liveRunsComplete={liveRunsComplete}
          baselineIsLive={baselineIsLive}
          candidateIsLive={candidateIsLive}
          readOnly
        />

      </div>
    </main>
  );
}

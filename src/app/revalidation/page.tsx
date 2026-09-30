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
import { computeReliabilityProfile, pct } from "@/core/metrics";
import { InstrumentPanel } from "@/components/instrument/InstrumentPanel";
import { StatusLED } from "@/components/instrument/StatusLED";
import { ConfusionMatrixDisplay } from "@/components/confusion-matrix";
import { RevalidationClient } from "@/components/RevalidationClient";

export default function RevalidationPage() {
  // ── Baseline (active) evaluator ───────────────────────────
  const cases             = FixtureRepository.getCases();
  const baselineJudgments = FixtureRepository.getBaselineJudgments();
  const activeVersion     = FixtureRepository.getActiveEvaluatorVersion();
  const activeRubric      = FixtureRepository.getActiveRubricVersion();
  const activeTaxonomy    = FixtureRepository.getActiveTaxonomyVersion();

  const baselineProfile = computeReliabilityProfile(
    cases, baselineJudgments, activeVersion.version
  );

  // ── Candidate from WorkflowStore ──────────────────────────
  const candidateVersion     = WorkflowStore.getCandidateVersion();
  const revalidationDecision = WorkflowStore.getRevalidationDecision();

  // ── Guard: no candidate yet → show guidance ───────────────
  if (!candidateVersion) {
    const diagnosis    = WorkflowStore.getDiagnosis();
    const intervention = WorkflowStore.getIntervention();

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

  // ── Candidate judgments from fixture (deterministic) ─────
  // The candidate version metadata comes from WorkflowStore (created by
  // the Intervention step). The actual judgments used for metrics are
  // the pre-computed fixture judgments — this is deliberate: the fixture
  // represents what we'd expect from the proposed rubric changes.
  const candidateJudgments = FixtureRepository.getCandidateJudgments();

  const candidateProfile = computeReliabilityProfile(
    cases, candidateJudgments, candidateVersion.version
  );

  // ── Delta computations ────────────────────────────────────
  const delta = {
    agreement:   candidateProfile.overallAgreement - baselineProfile.overallAgreement,
    failRecall:  candidateProfile.perClass.FAIL.recall - baselineProfile.perClass.FAIL.recall,
    failPrec:    candidateProfile.perClass.FAIL.precision - baselineProfile.perClass.FAIL.precision,
    passRecall:  candidateProfile.perClass.PASS.recall - baselineProfile.perClass.PASS.recall,
    failFNR:     candidateProfile.perClass.FAIL.falseNegativeRate - baselineProfile.perClass.FAIL.falseNegativeRate,
  };

  const bF = baselineProfile.perClass.FAIL;
  const cF = candidateProfile.perClass.FAIL;
  const bP = baselineProfile.perClass.PASS;
  const cP = candidateProfile.perClass.PASS;

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

          <div className="mt-2 font-mono text-[10px] text-jh-dim border border-jh-border-lt inline-flex items-center gap-2 px-2 py-1">
            TEST ENVIRONMENT · FIXTURE DATA · NO LIVE MODEL
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
            <div className="font-mono text-base font-bold text-jh-text">{candidateVersion.version}</div>
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
              Rubric {candidateVersion.rubricVersion} · Taxonomy {candidateVersion.taxonomyVersion}
            </div>
            {candidateVersion.changeDescription && (
              <div className="pt-1 border-t border-jh-border-lt font-mono text-[9px] text-jh-dim">
                {candidateVersion.changeDescription}
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
                    cand: pct(candidateProfile.overallAgreement),
                    d: delta.agreement,
                    better: true,
                  },
                  {
                    metric: "FAIL Recall (sensitivity)",
                    base: pct(bF.recall),
                    cand: pct(cF.recall),
                    d: delta.failRecall,
                    better: true,
                    highlight: true,
                  },
                  {
                    metric: "FAIL Precision",
                    base: pct(bF.precision),
                    cand: pct(cF.precision),
                    d: delta.failPrec,
                    better: true,
                  },
                  {
                    metric: "FAIL False Negative Rate",
                    base: pct(bF.falseNegativeRate),
                    cand: pct(cF.falseNegativeRate),
                    d: delta.failFNR,
                    better: false,
                  },
                  {
                    metric: "PASS Recall",
                    base: pct(bP.recall),
                    cand: pct(cP.recall),
                    d: delta.passRecall,
                    better: true,
                  },
                  {
                    metric: "PASS Precision",
                    base: pct(bP.precision),
                    cand: pct(cP.precision),
                    d: 0,
                    better: true,
                  },
                ].map(({ metric, base, cand, d, better, highlight }) => (
                  <tr key={metric} className={highlight ? "bg-red-50/10" : ""}>
                    <td className={`px-3 py-2 ${highlight ? "font-semibold" : ""}`}>{metric}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{base}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{cand}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${deltaClass(d, better)}`}>
                      {sign(d)}{pct(d)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-1.5 border-t border-jh-border-lt bg-jh-bg/40 font-mono text-[9px] text-jh-dim">
            Positive delta = candidate improves on baseline. Rep. sample n={baselineProfile.sampleN}.
          </div>
        </InstrumentPanel>

        {/* ── Confusion matrix side-by-side ─────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <InstrumentPanel label={`Confusion Matrix — ${activeVersion.version} (Baseline)`}>
            <ConfusionMatrixDisplay matrix={baselineProfile.confusionMatrix} />
          </InstrumentPanel>
          <InstrumentPanel label={`Confusion Matrix — ${candidateVersion.version} (Candidate)`}>
            <ConfusionMatrixDisplay matrix={candidateProfile.confusionMatrix} />
          </InstrumentPanel>
        </div>

        {/* ── Accept / Reject decision (client) ─────────────── */}
        <RevalidationClient
          baselineVersion={activeVersion.version}
          candidateVersion={candidateVersion.version}
          deltaFailRecall={delta.failRecall}
          existingDecision={revalidationDecision}
        />

      </div>
    </main>
  );
}

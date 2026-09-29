// ============================================================
// Judge Health – Overview Page (Milestone 1)
//
// Renders:
//   - Active evaluator / rubric / taxonomy versions
//   - Representative sample count
//   - Overall agreement + 95% Wilson CI
//   - Confusion matrix
//   - Per-class metrics with uncertainty
//   - Active metric trigger
//
// ALL values flow from /src/core logic via /src/data/fixture-repository.
// NO metric is hard-coded in this component.
// ============================================================
import { FixtureRepository } from "@/data/fixture-repository";
import { computeReliabilityProfile } from "@/core/metrics";
import { describeSamplingPlan } from "@/core/sampling";
import { evaluateAllTriggers } from "@/core/triggers";

import { VersionBadge } from "@/components/version-badge";
import { ConfusionMatrixDisplay } from "@/components/confusion-matrix";
import { ReliabilityProfilePanel } from "@/components/reliability-profile";
import { TriggerCard } from "@/components/trigger-card";

export default function OverviewPage() {
  // ── Load all fixture data (validated by Zod at boundary) ────
  const cases = FixtureRepository.getCases();
  const judgments = FixtureRepository.getBaselineJudgments();
  const activeVersion = FixtureRepository.getActiveEvaluatorVersion();
  const activeRubric = FixtureRepository.getActiveRubricVersion();
  const activeTaxonomy = FixtureRepository.getActiveTaxonomyVersion();
  const triggerConfigs = FixtureRepository.getTriggerConfigs();
  const currentConfig = FixtureRepository.getCurrentConfiguration();
  const baselineConfig = FixtureRepository.getBaselineConfiguration();

  // ── Compute reliability profile ─────────────────────────────
  const profile = computeReliabilityProfile(
    cases,
    judgments,
    activeVersion.version
  );

  // ── Describe sampling plan ──────────────────────────────────
  const samplingPlan = describeSamplingPlan(cases);

  // ── Evaluate all triggers ───────────────────────────────────
  const triggerResults = evaluateAllTriggers(
    triggerConfigs,
    profile,
    currentConfig,
    baselineConfig
  );

  const firedTriggers = triggerResults.filter((t) => t.fired);
  const okTriggers = triggerResults.filter((t) => !t.fired);

  return (
    <main className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-8">

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-900">
            Judge Health
          </h1>
          <p className="text-slate-500 text-sm">
            Continuous validation of model-based evaluators · Milestone 1 demo
          </p>
          <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-300 rounded px-3 py-1 text-xs text-amber-700 font-medium mt-2">
            ⚠ Fixture data · No live LLM · Values are deterministic
          </div>
        </div>

        {/* ── Version panel ───────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
            Active Configuration
          </h2>
          <div className="space-y-2">
            <VersionBadge
              label="Evaluator"
              version={activeVersion.version}
              status={activeVersion.status}
            />
            <VersionBadge
              label="Rubric"
              version={activeRubric.version}
            />
            <VersionBadge
              label="Taxonomy"
              version={activeTaxonomy.version}
            />
          </div>
          {activeVersion.changeDescription && (
            <p className="text-xs text-slate-400 border-t border-slate-100 pt-3">
              {activeVersion.changeDescription}
            </p>
          )}
        </section>

        {/* ── Sampling plan ───────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
            Sampling Plan
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-slate-800">
                {samplingPlan.totalCases}
              </div>
              <div className="text-xs text-slate-500">Total cases</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-700">
                {samplingPlan.representativeN}
              </div>
              <div className="text-xs text-slate-500">
                Representative sample
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-700">
                {samplingPlan.targetedRiskN}
              </div>
              <div className="text-xs text-slate-500">
                Targeted/risk cases
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-3 leading-relaxed">
            {samplingPlan.stratificationNote}
          </p>
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mt-2">
            Targeted/risk cases are excluded from all population-level metrics.
            They serve only for failure investigation.
          </div>
        </section>

        {/* ── Reliability profile ─────────────────────────────── */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">
            Reliability Profile — {activeVersion.version}
          </h2>
          <ReliabilityProfilePanel profile={profile} />
        </section>

        {/* ── Confusion matrix ────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">
            Confusion Matrix (representative sample only)
          </h2>
          <ConfusionMatrixDisplay matrix={profile.confusionMatrix} />
          <div className="text-xs text-slate-400 mt-3">
            Positive class = FAIL (minority / high-stakes). TP = evaluator
            correctly identifies a FAIL; FN = evaluator misses a FAIL.
          </div>
        </section>

        {/* ── Triggers ────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2">
            Trigger Status
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            A trigger is evidence to investigate — not evidence that the
            evaluator is wrong.
          </p>

          {firedTriggers.length > 0 && (
            <div className="space-y-3 mb-4">
              <div className="text-xs font-semibold text-red-700 uppercase tracking-wide">
                ● {firedTriggers.length} trigger{firedTriggers.length > 1 ? "s" : ""} fired
              </div>
              {firedTriggers.map((r) => (
                <TriggerCard key={r.config.id} result={r} />
              ))}
            </div>
          )}

          <div className="space-y-2">
            <div className="text-xs font-semibold text-green-700 uppercase tracking-wide">
              ✓ {okTriggers.length} within bounds
            </div>
            {okTriggers.map((r) => (
              <TriggerCard key={r.config.id} result={r} />
            ))}
          </div>
        </section>

        {/* ── Footer ──────────────────────────────────────────── */}
        <footer className="text-center text-xs text-slate-400 pb-4">
          Judge Health v0.1 · AACI Framework · Pedro Brandão ·{" "}
          <span className="font-mono">Milestone 1</span>
        </footer>
      </div>
    </main>
  );
}

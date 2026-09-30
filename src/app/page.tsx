// ============================================================
// Judge Health — Overview / Instrument Panel
//
// System state (LED, calibration seal, fired triggers) is now
// the sole responsibility of <AppNav>. This page renders only
// measurement data and diagnostic instruments.
//
// Desktop: 2-column CSS grid (instrument console)
//   "status  readouts"
//   "classes matrix"
//   "strip   strip"
//
// Mobile: stacked panels (progressive disclosure)
// ============================================================
import { FixtureRepository } from "@/data/fixture-repository";
import { computeReliabilityProfile, pct } from "@/core/metrics";
import { describeSamplingPlan } from "@/core/sampling";
import { evaluateAllTriggers } from "@/core/triggers";
import type { MetricTriggerConfig } from "@/core/types";

import { InstrumentPanel } from "@/components/instrument/InstrumentPanel";
import { InstrumentPlate } from "@/components/instrument/InstrumentPlate";
import { IndustrialWarning } from "@/components/instrument/IndustrialWarning";
import { MetricReadout } from "@/components/instrument/MetricReadout";
import { ReliabilityGauge } from "@/components/ReliabilityGauge";
import { ConfusionMatrixDisplay } from "@/components/confusion-matrix";
import { TriggerCard } from "@/components/trigger-card";
import { ReliabilityProfilePanel } from "@/components/reliability-profile";

export default function OverviewPage() {
  // ── Load fixture data ────────────────────────────────────────
  const cases          = FixtureRepository.getCases();
  const judgments      = FixtureRepository.getBaselineJudgments();
  const activeVersion  = FixtureRepository.getActiveEvaluatorVersion();
  const activeRubric   = FixtureRepository.getActiveRubricVersion();
  const activeTaxonomy = FixtureRepository.getActiveTaxonomyVersion();
  const triggerConfigs = FixtureRepository.getTriggerConfigs();
  const currentConfig  = FixtureRepository.getCurrentConfiguration();
  const baselineConfig = FixtureRepository.getBaselineConfiguration();

  // ── Compute ──────────────────────────────────────────────────
  const profile        = computeReliabilityProfile(cases, judgments, activeVersion.version);
  const samplingPlan   = describeSamplingPlan(cases);
  const triggerResults = evaluateAllTriggers(
    triggerConfigs, profile, currentConfig, baselineConfig
  );

  const firedTriggers  = triggerResults.filter((t) => t.fired);
  const isHealthy      = firedTriggers.length === 0;

  // Gauge: FAIL recall vs its configured threshold
  const failRecallTrigger = triggerConfigs.find(
    (t): t is MetricTriggerConfig =>
      t.type === "metric" && (t as MetricTriggerConfig).metric === "fail_recall"
  );
  const gaugeValue     = profile.perClass.FAIL.recall;
  const gaugeThreshold = failRecallTrigger?.threshold ?? 0.7;

  // Metric shorthands
  const F = profile.perClass.FAIL;
  const P = profile.perClass.PASS;
  const ciStr = (lo: number, hi: number) => `${pct(lo)} – ${pct(hi)}`;

  // InstrumentPlate rows (traceability — compact)
  const plateRows = [
    { label: "Eval.", value: activeVersion.version, status: "ok" as const },
    { label: "Rubric", value: activeRubric.version },
    { label: "Tax.",   value: activeTaxonomy.version },
    { label: "Valid.", value: activeVersion.createdAt },
  ];

  return (
    <main className="min-h-screen bg-jh-bg p-3 lg:p-4">
      <div className="max-w-[1100px] mx-auto">

        {/* ── Test environment badge ───────────────────────── */}
        <div className="mb-3 font-mono text-[10px] text-jh-dim border border-jh-border-lt inline-flex items-center gap-2 px-2 py-1">
          TEST ENVIRONMENT · FIXTURE DATA · NO LIVE MODEL
        </div>

        {/* ═══════════════════════════════════════════════════════
            DESKTOP DASHBOARD GRID — 2 columns
        ════════════════════════════════════════════════════════ */}
        <div className="jh-dash hidden lg:grid">

          {/* ─── EVALUATOR STATUS ─────────────────────────────── */}
          <InstrumentPanel
            label="Evaluator Status"
            style={{ gridArea: "status" }}
            accent={isHealthy ? undefined : "error"}
          >
            <div className="flex flex-col items-center py-2">
              <ReliabilityGauge
                value={gaugeValue}
                threshold={gaugeThreshold}
                metricLabel="FAIL RECALL"
                fired={!isHealthy}
              />

              {/* Instrument plate below gauge */}
              <div className="mt-3 w-full">
                <InstrumentPlate
                  modelId="JH-001"
                  rev="0.2"
                  serial="AACI-26-001"
                  rows={plateRows}
                />
              </div>
            </div>
          </InstrumentPanel>

          {/* ─── RELIABILITY READOUTS ─────────────────────────── */}
          <InstrumentPanel
            label={`Reliability Readouts — ${activeVersion.version}`}
            style={{ gridArea: "readouts" }}
            noPadding
          >
            {/* Overall agreement banner */}
            <div className="flex items-baseline justify-between px-3 py-2 border-b border-jh-border bg-jh-bg/40">
              <div>
                <span className="font-mono text-[11px] text-jh-dim">Overall Agreement</span>
                <span className="font-mono text-[10px] text-jh-border-mid ml-2">
                  n={profile.sampleN}
                </span>
              </div>
              <div className="text-right">
                <span className="font-mono font-bold text-xl tabular-nums text-jh-text">
                  {pct(profile.overallAgreement)}
                </span>
                <span className="font-mono text-[10px] text-jh-dim ml-2">
                  95% CI {ciStr(profile.overallAgreementCI.lower, profile.overallAgreementCI.upper)}
                </span>
              </div>
            </div>

            {/* FAIL class */}
            <div className="px-3 py-1 border-b border-jh-border-lt bg-jh-bg/60">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-jh-dim">
                FAIL Class · n={F.support}
              </span>
            </div>
            <MetricReadout
              label="Recall (sensitivity)"
              value={pct(F.recall)}
              ci={ciStr(F.recallCI.lower, F.recallCI.upper)}
              alert={F.recall < gaugeThreshold}
            />
            <MetricReadout
              label="Precision"
              value={pct(F.precision)}
              ci={ciStr(F.precisionCI.lower, F.precisionCI.upper)}
            />
            <MetricReadout label="False Positive Rate" value={pct(F.falsePositiveRate)} />
            <MetricReadout label="False Negative Rate" value={pct(F.falseNegativeRate)} />

            {/* PASS class */}
            <div className="px-3 py-1 border-b border-jh-border-lt border-t border-jh-border bg-jh-bg/60">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-jh-dim">
                PASS Class · n={P.support}
              </span>
            </div>
            <MetricReadout
              label="Recall (sensitivity)"
              value={pct(P.recall)}
              ci={ciStr(P.recallCI.lower, P.recallCI.upper)}
            />
            <MetricReadout
              label="Precision"
              value={pct(P.precision)}
              ci={ciStr(P.precisionCI.lower, P.precisionCI.upper)}
            />
            <MetricReadout label="False Positive Rate" value={pct(P.falsePositiveRate)} />
            <MetricReadout label="False Negative Rate" value={pct(P.falseNegativeRate)} />

            {/* Uncertainty note */}
            <div className="px-3 py-2 border-t border-jh-border text-[10px] font-mono text-jh-dim bg-amber-50/20">
              <span className="text-jh-amber font-semibold">Uncertainty: </span>
              {profile.uncertainty.note} Widest recall CI: {profile.uncertainty.widestRecallClass} class (
              {ciStr(
                profile.uncertainty.widestRecallCI.lower,
                profile.uncertainty.widestRecallCI.upper
              )}
              ).
            </div>
          </InstrumentPanel>

          {/* ─── CLASS PERFORMANCE ────────────────────────────── */}
          <InstrumentPanel
            label="Class Performance"
            style={{ gridArea: "classes" }}
            noPadding
          >
            <div className="overflow-x-auto">
            <table className="w-full text-[10px] font-mono min-w-[360px]">
              <thead>
                <tr className="border-b border-jh-border bg-jh-bg/60 text-jh-dim">
                  <th className="text-left px-2 py-1.5 font-normal tracking-[0.12em] uppercase">Class</th>
                  <th className="text-right px-2 py-1.5 font-normal tracking-[0.12em] uppercase">n</th>
                  <th className="text-right px-2 py-1.5 font-normal tracking-[0.12em] uppercase">Recall</th>
                  <th className="text-right px-2 py-1.5 font-normal tracking-[0.12em] uppercase">Precision</th>
                  <th className="text-right px-2 py-1.5 font-normal tracking-[0.12em] uppercase">FPR</th>
                  <th className="text-right px-2 py-1.5 font-normal tracking-[0.12em] uppercase">FNR</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-jh-border-lt bg-red-50/10">
                  <td className="px-2 py-2 font-semibold text-jh-red">FAIL</td>
                  <td className="px-2 py-2 text-right text-jh-dim">{F.support}</td>
                  <td className="px-2 py-2 text-right font-bold text-jh-red">
                    {pct(F.recall)}<span className="ml-0.5 text-[9px]">▼</span>
                  </td>
                  <td className="px-2 py-2 text-right">{pct(F.precision)}</td>
                  <td className="px-2 py-2 text-right">{pct(F.falsePositiveRate)}</td>
                  <td className="px-2 py-2 text-right">{pct(F.falseNegativeRate)}</td>
                </tr>
                <tr>
                  <td className="px-2 py-2 font-semibold text-jh-green">PASS</td>
                  <td className="px-2 py-2 text-right text-jh-dim">{P.support}</td>
                  <td className="px-2 py-2 text-right font-bold text-jh-green">{pct(P.recall)}</td>
                  <td className="px-2 py-2 text-right">{pct(P.precision)}</td>
                  <td className="px-2 py-2 text-right">{pct(P.falsePositiveRate)}</td>
                  <td className="px-2 py-2 text-right">{pct(P.falseNegativeRate)}</td>
                </tr>
              </tbody>
            </table>
            </div>
            <div className="px-2 py-2 border-t border-jh-border-lt text-[10px] font-mono text-jh-dim space-y-0.5 bg-jh-bg/40">
              <div>
                95% CI · FAIL recall {ciStr(F.recallCI.lower, F.recallCI.upper)} · PASS recall {ciStr(P.recallCI.lower, P.recallCI.upper)}
              </div>
              <div className="text-jh-amber">{profile.uncertainty.note}</div>
            </div>
          </InstrumentPanel>

          {/* ─── CONFUSION MATRIX ─────────────────────────────── */}
          <InstrumentPanel
            label="Confusion Matrix"
            style={{ gridArea: "matrix" }}
          >
            <ConfusionMatrixDisplay matrix={profile.confusionMatrix} />
          </InstrumentPanel>

          {/* ─── TRIGGER STRIP ────────────────────────────────── */}
          <InstrumentPanel
            label="Trigger Status"
            style={{ gridArea: "strip" }}
            noPadding
            accent={!isHealthy ? "error" : undefined}
          >
            {/* Industrial warning when degraded */}
            {!isHealthy && (
              <div className="p-3 border-b border-jh-border-lt">
                {firedTriggers.map((t) => {
                  const isMT = t.config.type === "metric";
                  const obsVal = t.observedValue;
                  const thrVal = isMT ? (t.config as import("@/core/types").MetricTriggerConfig).threshold : undefined;
                  return (
                    <IndustrialWarning
                      key={t.config.id}
                      title="MEASUREMENT RELIABILITY DEGRADED"
                      description={t.config.rationale}
                      metric={isMT ? (t.config as import("@/core/types").MetricTriggerConfig).metric.replace(/_/g, " ").toUpperCase() : t.config.id}
                      observed={obsVal !== undefined ? `${(obsVal * 100).toFixed(1)}%` : "—"}
                      threshold={thrVal !== undefined ? `${(thrVal * 100).toFixed(1)}%` : "—"}
                      actionLabel="INVESTIGATE EVIDENCE →"
                      actionHref="/evidence"
                    />
                  );
                })}
              </div>
            )}

            {/* Principle + summary */}
            <div className="px-3 py-1.5 border-b border-jh-border-lt bg-jh-bg/40 flex items-center justify-between gap-4">
              <span className="font-mono text-[10px] text-jh-dim italic">
                A trigger is evidence to investigate — not evidence that the evaluator is wrong.
              </span>
              <span className="font-mono text-[10px] text-jh-green shrink-0">
                ✓ {triggerResults.filter((t) => !t.fired).length} OK
              </span>
            </div>

            {/* Configuration metadata */}
            <div className="px-3 py-1 border-b border-jh-border-lt bg-jh-bg/60 flex items-center gap-4 font-mono text-[9px] text-jh-dim">
              <span>Evaluator <span className="text-jh-text">{activeVersion.version}</span></span>
              <span className="text-jh-border-lt">·</span>
              <span>Rubric <span className="text-jh-text">{activeRubric.version}</span></span>
              <span className="text-jh-border-lt">·</span>
              <span>Taxonomy <span className="text-jh-text">{activeTaxonomy.version}</span></span>
              <span className="text-jh-border-lt">·</span>
              <span>Rep. n=<span className="text-jh-text">{samplingPlan.representativeN}</span></span>
              <span>Risk n=<span className="text-jh-text">{samplingPlan.targetedRiskN}</span> (excl.)</span>
            </div>

            {/* Column header */}
            <div className="hidden lg:grid grid-cols-[14px_40px_56px_1fr_110px_60px_16px] gap-2 px-3 py-1 border-b border-jh-border-lt bg-jh-bg/60 text-[9px] font-mono text-jh-dim uppercase tracking-[0.12em]">
              <div /><div>State</div><div>Type</div><div>ID</div>
              <div>Condition</div><div className="text-right">Observed</div><div />
            </div>

            <div>
              {[
                ...triggerResults.filter((t) => t.fired),
                ...triggerResults.filter((t) => !t.fired),
              ].map((result) => (
                <TriggerCard key={result.config.id} result={result} />
              ))}
            </div>
          </InstrumentPanel>
        </div>

        {/* ═══════════════════════════════════════════════════════
            MOBILE LAYOUT — stacked panels
        ════════════════════════════════════════════════════════ */}
        <div className="lg:hidden space-y-3">

          {/* Industrial warning — most prominent on mobile */}
          {!isHealthy && firedTriggers.map((t) => {
            const isMT = t.config.type === "metric";
            const obsVal = t.observedValue;
            const thrVal = isMT ? (t.config as import("@/core/types").MetricTriggerConfig).threshold : undefined;
            return (
              <IndustrialWarning
                key={t.config.id}
                title="MEASUREMENT RELIABILITY DEGRADED"
                description={t.config.rationale}
                metric={isMT ? (t.config as import("@/core/types").MetricTriggerConfig).metric.replace(/_/g, " ").toUpperCase() : t.config.id}
                observed={obsVal !== undefined ? `${(obsVal * 100).toFixed(1)}%` : "—"}
                threshold={thrVal !== undefined ? `${(thrVal * 100).toFixed(1)}%` : "—"}
                actionLabel="INVESTIGATE EVIDENCE →"
                actionHref="/evidence"
              />
            );
          })}

          <InstrumentPanel label="Evaluator Status" accent={isHealthy ? undefined : "error"}>
            <div className="flex flex-col items-center py-3">
              <ReliabilityGauge
                value={gaugeValue}
                threshold={gaugeThreshold}
                metricLabel="FAIL RECALL"
                fired={!isHealthy}
              />
              <div className="mt-3 w-full">
                <InstrumentPlate
                  modelId="JH-001"
                  rev="0.2"
                  serial="AACI-26-001"
                  rows={[
                    { label: "Eval.", value: activeVersion.version },
                    { label: "n",     value: String(profile.sampleN) },
                  ]}
                  compact
                />
              </div>
            </div>
          </InstrumentPanel>

          <InstrumentPanel label={`Reliability Readouts — ${activeVersion.version}`} noPadding>
            <ReliabilityProfilePanel profile={profile} alertThreshold={gaugeThreshold} />
          </InstrumentPanel>

          <InstrumentPanel label="Confusion Matrix">
            <ConfusionMatrixDisplay matrix={profile.confusionMatrix} />
          </InstrumentPanel>

          <InstrumentPanel label="Class Performance" noPadding>
            <table className="w-full text-[11px] font-mono">
              <thead>
                <tr className="border-b border-jh-border bg-jh-bg/60 text-jh-dim">
                  <th className="text-left px-2 py-1.5 font-normal">Class</th>
                  <th className="text-right px-2 py-1.5 font-normal">n</th>
                  <th className="text-right px-2 py-1.5 font-normal">Recall</th>
                  <th className="text-right px-2 py-1.5 font-normal">Precision</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-jh-border-lt">
                  <td className="px-2 py-2 font-semibold text-jh-red">FAIL</td>
                  <td className="px-2 py-2 text-right text-jh-dim">{F.support}</td>
                  <td className="px-2 py-2 text-right font-bold text-jh-red">{pct(F.recall)} ▼</td>
                  <td className="px-2 py-2 text-right">{pct(F.precision)}</td>
                </tr>
                <tr>
                  <td className="px-2 py-2 font-semibold text-jh-green">PASS</td>
                  <td className="px-2 py-2 text-right text-jh-dim">{P.support}</td>
                  <td className="px-2 py-2 text-right font-bold text-jh-green">{pct(P.recall)}</td>
                  <td className="px-2 py-2 text-right">{pct(P.precision)}</td>
                </tr>
              </tbody>
            </table>
          </InstrumentPanel>

          <InstrumentPanel label="Trigger Status" noPadding accent={!isHealthy ? "error" : undefined}>
            <div className="px-3 py-1.5 border-b border-jh-border-lt bg-jh-bg/40">
              <span className="font-mono text-[10px] text-jh-dim italic">
                A trigger is evidence to investigate — not a verdict.
              </span>
            </div>
            {[
              ...triggerResults.filter((t) => t.fired),
              ...triggerResults.filter((t) => !t.fired),
            ].map((result) => (
              <TriggerCard key={result.config.id} result={result} />
            ))}
          </InstrumentPanel>
        </div>

        {/* ─── Footer ─────────────────────────────────────────── */}
        <footer className="mt-4 pt-3 border-t border-jh-border-lt text-center">
          <span className="font-mono text-[10px] text-jh-dim">
            JUDGE HEALTH v0.2 &middot; AACI Framework &middot; Milestone 2
          </span>
        </footer>
      </div>
    </main>
  );
}

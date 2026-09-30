// ============================================================
// Judge Health — Diagnose Screen
//
// Structured diagnosis tool for evaluating triggered alerts.
// The analyst selects a root-cause category, writes an
// observation note, and triggers revalidation if needed.
//
// Server component — passes fixture data to DiagnoseClient.
// ============================================================
import { FixtureRepository } from "@/data/fixture-repository";
import { WorkflowStore } from "@/data/workflow-store";
import { computeReliabilityProfile, pct } from "@/core/metrics";
import { evaluateAllTriggers } from "@/core/triggers";
import type { MetricTriggerConfig } from "@/core/types";
import { InstrumentPanel } from "@/components/instrument/InstrumentPanel";
import { StatusLED } from "@/components/instrument/StatusLED";
import { DiagnoseClient } from "@/components/DiagnoseClient";

export default function DiagnosePage() {
  // ── Load fixture state ────────────────────────────────────
  const cases          = FixtureRepository.getCases();
  const judgments      = FixtureRepository.getBaselineJudgments();
  const activeVersion  = FixtureRepository.getActiveEvaluatorVersion();
  const activeRubric   = FixtureRepository.getActiveRubricVersion();
  const activeTaxonomy = FixtureRepository.getActiveTaxonomyVersion();
  const triggerConfigs = FixtureRepository.getTriggerConfigs();
  const currentConfig  = FixtureRepository.getCurrentConfiguration();
  const baselineConfig = FixtureRepository.getBaselineConfiguration();

  const profile      = computeReliabilityProfile(cases, judgments, activeVersion.version);
  const triggerResults = evaluateAllTriggers(
    triggerConfigs, profile, currentConfig, baselineConfig
  );

  const firedTriggers  = triggerResults.filter((t) => t.fired);
  const isHealthy      = firedTriggers.length === 0;

  // Read existing diagnosis from workflow store
  const existingDiagnosis = WorkflowStore.getDiagnosis();

  // Key observed metric for context
  const failRecallTrigger = triggerConfigs.find(
    (t): t is MetricTriggerConfig =>
      t.type === "metric" && (t as MetricTriggerConfig).metric === "fail_recall"
  );
  const gaugeThreshold = failRecallTrigger?.threshold ?? 0.7;

  return (
    <main className="min-h-screen bg-jh-bg p-3 lg:p-4">
      <div className="max-w-[900px] mx-auto space-y-4">

        {/* ── Page identity ─────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-jh-border-lt pb-3">
          <div>
            <h2 className="font-sketch text-[1.6rem] font-bold leading-none tracking-wide text-jh-text">
              Diagnosis Log
            </h2>
            <p className="font-mono text-[11px] text-jh-dim mt-1">
              Classify the root cause of each triggered alert and decide on follow-up action.
            </p>
          </div>
          <StatusLED
            status={isHealthy ? "ok" : "error"}
            label={isHealthy ? "No active alerts" : `${firedTriggers.length} alert${firedTriggers.length > 1 ? "s" : ""} open`}
            pulse={!isHealthy}
          />
        </div>

        {/* ── System state snapshot ─────────────────────────── */}
        <InstrumentPanel label="Current Measurement Snapshot" noPadding>
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-jh-border-lt">
            {[
              { label: "FAIL RECALL", value: pct(profile.perClass.FAIL.recall), alert: profile.perClass.FAIL.recall < gaugeThreshold },
              { label: "PASS RECALL", value: pct(profile.perClass.PASS.recall), alert: false },
              { label: "AGREEMENT",  value: pct(profile.overallAgreement),      alert: false },
              { label: "SAMPLE N",   value: String(profile.sampleN),            alert: false },
            ].map(({ label, value, alert }) => (
              <div key={label} className="px-4 py-3">
                <div className={`font-mono font-bold text-lg tabular-nums ${alert ? "text-jh-red" : "text-jh-text"}`}>
                  {value}
                </div>
                <div className="font-mono text-[9px] text-jh-dim uppercase tracking-wide mt-0.5">{label}</div>
              </div>
            ))}
          </div>
          <div className="px-4 py-2 border-t border-jh-border-lt bg-jh-bg/40 font-mono text-[9px] text-jh-dim flex items-center gap-3">
            <span>Evaluator <span className="text-jh-text">{activeVersion.version}</span></span>
            <span>·</span>
            <span>Rubric <span className="text-jh-text">{activeRubric.version}</span></span>
            <span>·</span>
            <span>Taxonomy <span className="text-jh-text">{activeTaxonomy.version}</span></span>
          </div>
        </InstrumentPanel>

        {/* ── Fired triggers summary ─────────────────────────── */}
        {firedTriggers.length > 0 ? (
          <InstrumentPanel
            label={`Fired Triggers — ${firedTriggers.length} require diagnosis`}
            noPadding
            accent="error"
          >
            {firedTriggers.map((t) => (
              <div
                key={t.config.id}
                className="px-4 py-3 border-b border-jh-border-lt last:border-0 flex items-start gap-3"
              >
                <div className="mt-0.5 shrink-0">
                  <StatusLED status="error" size="sm" pulse />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[11px] font-bold text-jh-red">
                    {t.config.id}
                  </div>
                  <div className="font-mono text-[10px] text-jh-dim mt-0.5">
                    {t.config.rationale}
                  </div>
                  {t.observedValue !== undefined && (
                    <div className="font-mono text-[10px] text-jh-dim mt-0.5">
                      Observed: <span className="text-jh-red font-semibold">{(t.observedValue * 100).toFixed(1)}%</span>
                    </div>
                  )}
                </div>
                <div className="shrink-0 font-mono text-[10px] border border-jh-red/40 text-jh-red px-2 py-0.5">
                  FIRED
                </div>
              </div>
            ))}
          </InstrumentPanel>
        ) : (
          <InstrumentPanel label="Trigger Status" accent="ok">
            <div className="flex items-center gap-3 py-2">
              <StatusLED status="ok" />
              <span className="font-mono text-[11px] text-jh-green">
                All triggers within bounds — no diagnosis required at this time.
              </span>
            </div>
          </InstrumentPanel>
        )}

        {/* ── Diagnosis form (client component) ─────────────── */}
        <DiagnoseClient
          firedCount={firedTriggers.length}
          firedTriggerIds={firedTriggers.map((t) => t.config.id)}
          evaluatorVersion={activeVersion.version}
          existingDiagnosis={existingDiagnosis}
        />

      </div>
    </main>
  );
}

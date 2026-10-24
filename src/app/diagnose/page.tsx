// ============================================================
// Judge Health — Diagnose Screen
//
// Structured diagnosis tool for evaluating triggered alerts.
// The analyst selects a root-cause category, writes an
// observation note, and triggers revalidation if needed.
//
// Server component — passes fixture data to DiagnoseClient.
// ============================================================
import Link from "next/link";
import { FixtureRepository } from "@/data/fixture-repository";
import { RunStore, liveJudgmentsToJudgments } from "@/data/run-store";
import { WorkflowStore } from "@/data/workflow-store";
import { computeReliabilityProfile, pct } from "@/core/metrics";
import { evaluateAllTriggers } from "@/core/triggers";
import { buildExperimentDashboard } from "@/core/experiment-dashboard";
import type { ExperimentRecord, MetricTriggerConfig } from "@/core/types";
import { InstrumentPanel } from "@/components/instrument/InstrumentPanel";
import { StatusLED } from "@/components/instrument/StatusLED";
import { DiagnoseClient } from "@/components/DiagnoseClient";
import { ConfusionMatrixDisplay } from "@/components/confusion-matrix";
import { activeWorkspace } from "@/data/experiment-store";
import { getDataset } from "@/data/datasets";
import { getBaselineRunForExperiment } from "@/data/experiment-run-store";

function ExperimentDiagnose({ experiment }: { experiment: ExperimentRecord }) {
  const dataset = getDataset(experiment.datasetId);
  const run = getBaselineRunForExperiment(experiment.id) ?? null;
  const ready = Boolean(dataset && run?.status === "completed");
  const dashboard = dataset
    ? buildExperimentDashboard(experiment, run, dataset, FixtureRepository.getTriggerConfigs())
    : null;
  const fired = dashboard?.triggerResults.filter((item) => item.fired) ?? [];
  const diagnosis = experiment.workflow.diagnosis;
  const locked = Boolean(experiment.workflow.currentInterventionId);

  return (
    <main className="min-h-screen bg-jh-bg p-3 lg:p-4">
      <div className="max-w-[900px] mx-auto space-y-4">
        <div className="flex items-center justify-between border-b border-jh-border-lt pb-3">
          <div>
            <h2 className="font-sketch text-[1.6rem] font-bold leading-none tracking-wide text-jh-text">
              Diagnosis Log
            </h2>
            <p className="font-mono text-[11px] text-jh-dim mt-1">
              {experiment.name}. Classify an observed failure and decide on follow-up action.
            </p>
          </div>
          <StatusLED
            status={!ready ? "inactive" : fired.length === 0 ? "ok" : "error"}
            label={!ready ? "Baseline required" : fired.length === 0 ? "No active alerts" : `${fired.length} alert${fired.length > 1 ? "s" : ""} open`}
            pulse={ready && fired.length > 0}
          />
        </div>

        {!ready || !dashboard ? (
          <InstrumentPanel label="No Live Baseline" accent="warn">
            <div className="flex items-start gap-3 py-2">
              <StatusLED status="inactive" />
              <div className="space-y-1">
                <div className="font-mono text-[11px] text-jh-dim">
                  Diagnosis requires a completed Live Baseline run.
                </div>
                <Link href="/" className="inline-block font-mono text-[10px] text-jh-text hover:underline">
                  Run Live Baseline from the Overview page first.
                </Link>
              </div>
            </div>
          </InstrumentPanel>
        ) : (
          <>
            {dataset?.demonstration && (
              <p className="font-mono text-[10px] border border-jh-amber/50 bg-amber-50/30 text-jh-amber px-3 py-2">
                Synthetic demonstration data. Representative n={dashboard.representativeN}. This is not a statistically validated calibration.
              </p>
            )}
            <InstrumentPanel label="Current Measurement Snapshot" noPadding>
              <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-jh-border-lt">
                {[
                  { label: "FAIL RECALL", value: pct(dashboard.profile.perClass.FAIL.recall), alert: dashboard.failRecallFired },
                  { label: "FAIL PRECISION", value: pct(dashboard.profile.perClass.FAIL.precision), alert: false },
                  { label: "AGREEMENT", value: pct(dashboard.profile.overallAgreement), alert: false },
                  { label: "SAMPLE N", value: String(dashboard.profile.sampleN), alert: false },
                ].map(({ label, value, alert }) => (
                  <div key={label} className="px-4 py-3">
                    <div className={`font-mono font-bold text-lg tabular-nums ${alert ? "text-jh-red" : "text-jh-text"}`}>{value}</div>
                    <div className="font-mono text-[9px] text-jh-dim uppercase tracking-wide mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
              <div className="px-4 py-2 border-t border-jh-border-lt bg-jh-bg/40 font-mono text-[9px] text-jh-dim flex flex-wrap gap-3">
                <span>Config <span className="text-jh-text">{experiment.config.version}</span></span>
                <span>Rubric <span className="text-jh-text">{experiment.config.rubricVersion}</span></span>
                <span>Model <span className="text-jh-text">{experiment.config.modelId}</span></span>
              </div>
            </InstrumentPanel>

            {fired.length > 0 ? (
              <InstrumentPanel label={`Fired Triggers — ${fired.length} require diagnosis`} noPadding accent="error">
                {fired.map((item) => (
                  <div key={item.config.id} className="px-4 py-3 border-b border-jh-border-lt last:border-0 flex items-start gap-3">
                    <StatusLED status="error" size="sm" pulse />
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[11px] font-bold text-jh-red">{item.config.id}</div>
                      <div className="font-mono text-[10px] text-jh-dim mt-0.5">{item.config.rationale}</div>
                    </div>
                    <div className="shrink-0 font-mono text-[10px] border border-jh-red/40 text-jh-red px-2 py-0.5">FIRED</div>
                  </div>
                ))}
              </InstrumentPanel>
            ) : (
              <InstrumentPanel label="Trigger Status" accent="ok">
                <div className="space-y-1 py-1">
                  <div className="flex items-center gap-3">
                    <StatusLED status="ok" />
                    <span className="font-mono text-[11px] text-jh-green">
                      All triggers within bounds.
                    </span>
                  </div>
                  <p className="font-mono text-[10px] text-jh-dim pl-7">
                    A diagnosis can still be recorded from observed disagreements, including false positives.
                  </p>
                </div>
              </InstrumentPanel>
            )}

            <InstrumentPanel label="Evidence — representative sample" noPadding>
              <div className="p-3 border-b border-jh-border-lt">
                <ConfusionMatrixDisplay matrix={dashboard.profile.confusionMatrix} />
                <p className="font-mono text-[10px] text-jh-dim mt-2">
                  Positive class is FAIL. TP {dashboard.profile.confusionMatrix.TP} · FP {dashboard.profile.confusionMatrix.FP} · TN {dashboard.profile.confusionMatrix.TN} · FN {dashboard.profile.confusionMatrix.FN}
                </p>
              </div>
              <EvidenceLinks
                rows={dashboard.representativeEvidence}
                empty="No representative cases were judged."
              />
            </InstrumentPanel>
            <InstrumentPanel label={`Targeted / risk — n=${dashboard.targetedEvidence.length} · excluded from the estimate`} noPadding>
              <EvidenceLinks
                rows={dashboard.targetedEvidence}
                empty="No targeted/risk cases were judged."
              />
            </InstrumentPanel>

            <DiagnoseClient
              firedCount={fired.length}
              firedTriggerIds={fired.map((item) => item.config.id)}
              evaluatorVersion={experiment.config.version}
              existingDiagnosis={diagnosis}
              experimentId={experiment.id}
              readOnly={locked}
              formLabel={fired.length === 0 ? "Diagnosis Form — manual review" : undefined}
            />
          </>
        )}
      </div>
    </main>
  );
}

function EvidenceLinks({
  rows,
  empty,
}: {
  rows: { caseId: string; result: string; groundTruth: string; evaluatorLabel: string }[];
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="px-4 py-3 font-mono text-[10px] text-jh-dim">{empty}</p>;
  }
  const order = ["FP", "FN", "TP", "TN"];
  const sorted = [...rows].sort((a, b) => order.indexOf(a.result) - order.indexOf(b.result));
  return (
    <div>
      {sorted.map((row) => (
        <Link
          key={row.caseId}
          href={`/evidence/${row.caseId}`}
          className="flex items-center gap-3 px-4 py-2 border-b border-jh-border-lt last:border-0 font-mono text-[10px] hover:bg-jh-bg"
        >
          <span className="text-jh-text w-28 shrink-0">{row.caseId}</span>
          <span className={row.result === "FP" || row.result === "FN" ? "text-jh-red" : "text-jh-dim"}>{row.result}</span>
          <span className="text-jh-dim">truth {row.groundTruth}</span>
          <span className="text-jh-dim">evaluator {row.evaluatorLabel}</span>
        </Link>
      ))}
      <div className="px-4 py-2">
        <Link href="/evidence" className="font-mono text-[10px] text-jh-text hover:underline">Open evidence →</Link>
      </div>
    </div>
  );
}

export default function DiagnosePage() {
  const workspace = activeWorkspace();
  if (workspace.mode === "configured") {
    return <ExperimentDiagnose experiment={workspace.experiment} />;
  }
  // ── Resolve live vs fixture judgments ─────────────────────
  const liveRun = RunStore.getBaselineRun();
  const isLive  = liveRun?.mode === "live" &&
    (liveRun.status === "completed" || liveRun.status === "partial_failure");

  const cases          = FixtureRepository.getCases();
  const judgments      = isLive
    ? liveJudgmentsToJudgments(liveRun!.judgments)
    : FixtureRepository.getBaselineJudgments();
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

  if (!isLive) {
    return (
      <main className="min-h-screen bg-jh-bg p-3 lg:p-4">
        <div className="max-w-[900px] mx-auto space-y-4">
          <div className="border-b border-jh-border-lt pb-3">
            <h2 className="font-sketch text-[1.6rem] font-bold leading-none tracking-wide text-jh-text">
              Diagnosis Log
            </h2>
            <p className="font-mono text-[11px] text-jh-dim mt-1">
              Classify the root cause of each triggered alert and decide on follow-up action.
            </p>
          </div>
          <InstrumentPanel label="No Live Baseline" accent="warn">
            <div className="flex items-start gap-3 py-2">
              <StatusLED status="inactive" />
              <div className="space-y-1">
                <div className="font-mono text-[11px] text-jh-dim">
                  Diagnosis requires a completed Live Baseline run.
                </div>
                <div className="font-mono text-[10px] text-jh-border-mid">
                  Run Live Baseline from the Overview page first. Triggers are evaluated against live measurements only.
                </div>
              </div>
            </div>
          </InstrumentPanel>
        </div>
      </main>
    );
  }

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
          readOnly
        />

      </div>
    </main>
  );
}

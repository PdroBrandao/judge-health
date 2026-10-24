import { pct } from "@/core/metrics";
import { summarizeBaseline } from "@/core/experiment-baseline";
import type { EvaluationDataset } from "@/data/datasets";
import type { ExperimentBaselineRun } from "@/core/types";
import { InstrumentPanel } from "@/components/instrument/InstrumentPanel";
import { MetricReadout } from "@/components/instrument/MetricReadout";

export function BaselineResults({
  run,
  dataset,
}: {
  run: ExperimentBaselineRun;
  dataset: EvaluationDataset;
}) {
  const summary = summarizeBaseline(run, dataset);
  const complete = run.status === "completed";
  const statusLabel = complete ? "LIVE BASELINE COMPLETE"
    : run.status === "partial_failure" ? "PARTIAL BASELINE"
    : run.status === "failed" ? "BASELINE FAILED"
    : "BASELINE RUNNING";

  return (
    <div className="space-y-3">
      <InstrumentPanel label={complete ? "Live baseline" : "Baseline status"} accent={complete ? "ok" : "warn"}>
        <div className="space-y-2 font-mono text-[11px]">
          <p className={complete ? "text-jh-green font-semibold" : "text-jh-amber font-semibold"}>
            {statusLabel} · {summary.completed}/{run.caseIds.length}
          </p>
          <Row label="Mode" value="LIVE" />
          <Row label="Model" value={run.modelId} />
          <Row label="Rubric" value={run.rubricVersion} />
          <Row label="Sample" value={String(run.caseIds.length)} />
          <Row label="Tokens" value={String(run.usage.totalTokens)} />
          {summary.durationMs !== null && (
            <Row label="Duration" value={`${(summary.durationMs / 1000).toFixed(1)}s`} />
          )}
        </div>
      </InstrumentPanel>

      {complete && (
        <>
          <InstrumentPanel label="Representative reliability">
            <MetricReadout label="Overall agreement" value={pct(summary.profile.overallAgreement)} subLabel={`n=${summary.representativeCount}`} />
            <MetricReadout label="FAIL recall" value={pct(summary.profile.perClass.FAIL.recall)} />
            <MetricReadout label="FAIL precision" value={pct(summary.profile.perClass.FAIL.precision)} />
            <div className="grid grid-cols-4 gap-2 pt-2 font-mono text-[10px]">
              <Count label="TP" value={summary.profile.confusionMatrix.TP} />
              <Count label="FP" value={summary.profile.confusionMatrix.FP} />
              <Count label="TN" value={summary.profile.confusionMatrix.TN} />
              <Count label="FN" value={summary.profile.confusionMatrix.FN} />
            </div>
          </InstrumentPanel>
          <InstrumentPanel label="Targeted/risk guardrail">
            <p className="font-mono text-[10px] text-jh-dim mb-2">
              {summary.targetedCount} cases. Excluded from the representative reliability estimate.
            </p>
            <div className="grid grid-cols-4 gap-2 font-mono text-[10px]">
              <Count label="TP" value={summary.targetedMatrix.TP} />
              <Count label="FP" value={summary.targetedMatrix.FP} />
              <Count label="TN" value={summary.targetedMatrix.TN} />
              <Count label="FN" value={summary.targetedMatrix.FN} />
            </div>
          </InstrumentPanel>
        </>
      )}

      <InstrumentPanel label="Case evidence" noPadding>
        <div className="divide-y divide-jh-border-lt">
          {summary.rows.map((row) => (
            <article key={row.id} className="px-3 py-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]">
                <span className="text-jh-text">{row.id}</span>
                <span className="text-jh-dim">{row.sampleType === "targeted_risk" ? "Targeted/risk" : "Representative"}</span>
                <span className="text-jh-dim">Truth {row.groundTruth}</span>
                {row.judgment?.label && <span className="text-jh-text">Model {row.judgment.label}</span>}
                {row.result && <span className="text-jh-text">{row.result}</span>}
                {row.judgment?.status === "failed" && <span className="text-jh-red">FAILED</span>}
              </div>
              {row.input && (
                <div className="grid gap-2 md:grid-cols-2 text-[12px]">
                  <p className="border border-jh-border-lt px-2 py-2 whitespace-pre-wrap">{row.input}</p>
                  <p className="border border-jh-border-lt px-2 py-2 whitespace-pre-wrap">{row.systemOutput}</p>
                </div>
              )}
              {row.judgment?.rationale && (
                <p className="font-mono text-[10px] text-jh-dim">{row.judgment.rationale}</p>
              )}
              {row.judgment?.error && (
                <p className="font-mono text-[10px] text-jh-red">{row.judgment.error}</p>
              )}
              {row.judgment?.latencyMs !== undefined && (
                <p className="font-mono text-[10px] text-jh-dim">
                  {row.judgment.latencyMs}ms
                  {row.judgment.totalTokens !== undefined && ` · ${row.judgment.totalTokens} tokens`}
                  {row.judgment.attempts > 1 && ` · ${row.judgment.attempts} attempts`}
                </p>
              )}
            </article>
          ))}
        </div>
      </InstrumentPanel>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-jh-dim w-24">{label}</span>
      <span className="text-jh-text">{value}</span>
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-jh-border-lt px-2 py-2">
      <div className="text-jh-dim">{label}</div>
      <div className="text-jh-text font-semibold">{value}</div>
    </div>
  );
}

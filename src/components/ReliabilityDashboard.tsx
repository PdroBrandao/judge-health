import { pct } from "@/core/metrics";
import type { ExperimentDashboardModel } from "@/core/experiment-dashboard";
import type { MetricTriggerConfig } from "@/core/types";
import { ConfusionMatrixDisplay } from "@/components/confusion-matrix";
import { IndustrialWarning } from "@/components/instrument/IndustrialWarning";
import { InstrumentPanel } from "@/components/instrument/InstrumentPanel";
import { InstrumentPlate } from "@/components/instrument/InstrumentPlate";
import { MetricReadout } from "@/components/instrument/MetricReadout";
import { ReliabilityGauge } from "@/components/ReliabilityGauge";
import { ReliabilityProfilePanel } from "@/components/reliability-profile";
import { TriggerCard } from "@/components/trigger-card";

export function ReliabilityDashboard({ model }: { model: ExperimentDashboardModel }) {
  const { profile } = model;
  const F = profile.perClass.FAIL;
  const P = profile.perClass.PASS;
  const ci = (lo: number, hi: number) => `${pct(lo)} – ${pct(hi)}`;
  const degraded = model.measured && model.triggerResults.some((item) => item.fired);
  const fired = model.triggerResults.filter((item) => item.fired);

  return (
    <div className="space-y-3">
      {model.demonstration && (
        <p className="font-mono text-[10px] border border-jh-amber/50 bg-amber-50/30 text-jh-amber px-3 py-2">
          Synthetic demonstration data. Representative n={model.representativeN}, targeted/risk n={model.targetedN}.
          This is not a statistically validated calibration. Thresholds are illustrative operational controls.
          Wilson intervals reflect this sample size only.
        </p>
      )}

      <div className="font-mono text-[10px] border border-jh-green/60 text-jh-green inline-flex items-center gap-2 px-2 py-1">
        <span className="w-2 h-2 rounded-full bg-jh-led-green" />
        LIVE · {model.modelId} · {model.caseCount} cases · {model.rubricVersion}
        {model.totalTokens !== null && ` · ${model.totalTokens} tokens`}
        {model.durationMs !== null && ` · ${(model.durationMs / 1000).toFixed(1)}s`}
      </div>

      <div className="jh-dash hidden lg:grid">
        <InstrumentPanel label="Evaluator Status" style={{ gridArea: "status" }} accent={degraded ? "error" : undefined}>
          <div className="flex flex-col items-center py-2">
            <ReliabilityGauge
              value={model.measured ? profile.perClass.FAIL.recall : null}
              threshold={model.gaugeThreshold}
              metricLabel="FAIL RECALL"
              fired={model.failRecallFired}
            />
            <div className="mt-3 w-full">
              <InstrumentPlate
                modelId={model.modelId}
                rev={model.configVersion}
                serial={model.experimentId}
                rows={[
                  { label: "Rubric", value: model.rubricVersion },
                  { label: "Rep. n", value: String(model.representativeN) },
                  { label: "Risk n", value: String(model.targetedN) },
                  { label: "Mode", value: "LIVE" },
                ]}
              />
            </div>
          </div>
        </InstrumentPanel>

        <InstrumentPanel label={`Reliability Readouts — ${model.configVersion}`} style={{ gridArea: "readouts" }} noPadding>
          <div className="flex items-baseline justify-between px-3 py-2 border-b border-jh-border bg-jh-bg/40">
            <div>
              <span className="font-mono text-[11px] text-jh-dim">Overall Agreement</span>
              <span className="font-mono text-[10px] text-jh-border-mid ml-2">n={profile.sampleN}</span>
            </div>
            <div className="text-right">
              <span className="font-mono font-bold text-xl tabular-nums text-jh-text">{pct(profile.overallAgreement)}</span>
              <span className="font-mono text-[10px] text-jh-dim ml-2">
                95% CI {ci(profile.overallAgreementCI.lower, profile.overallAgreementCI.upper)}
              </span>
            </div>
          </div>
          <div className="px-3 py-1 border-b border-jh-border-lt bg-jh-bg/60">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-jh-dim">FAIL Class · n={F.support}</span>
          </div>
          <MetricReadout label="Recall (sensitivity)" value={pct(F.recall)} ci={ci(F.recallCI.lower, F.recallCI.upper)} alert={F.recall < model.gaugeThreshold} />
          <MetricReadout label="Precision" value={pct(F.precision)} ci={ci(F.precisionCI.lower, F.precisionCI.upper)} />
          <MetricReadout label="False Positive Rate" value={pct(F.falsePositiveRate)} />
          <MetricReadout label="False Negative Rate" value={pct(F.falseNegativeRate)} />
          <div className="px-3 py-1 border-b border-jh-border-lt border-t border-jh-border bg-jh-bg/60">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-jh-dim">PASS Class · n={P.support}</span>
          </div>
          <MetricReadout label="Recall (sensitivity)" value={pct(P.recall)} ci={ci(P.recallCI.lower, P.recallCI.upper)} />
          <MetricReadout label="Precision" value={pct(P.precision)} ci={ci(P.precisionCI.lower, P.precisionCI.upper)} />
          <MetricReadout label="False Positive Rate" value={pct(P.falsePositiveRate)} />
          <MetricReadout label="False Negative Rate" value={pct(P.falseNegativeRate)} />
          <div className="px-3 py-2 border-t border-jh-border text-[10px] font-mono text-jh-dim bg-amber-50/20">
            <span className="text-jh-amber font-semibold">Uncertainty: </span>
            {profile.uncertainty.note}
          </div>
        </InstrumentPanel>

        <InstrumentPanel label="Class Performance" style={{ gridArea: "classes" }} noPadding>
          <table className="w-full text-[10px] font-mono">
            <thead>
              <tr className="border-b border-jh-border bg-jh-bg/60 text-jh-dim">
                <th className="text-left px-2 py-1.5 font-normal">Class</th>
                <th className="text-right px-2 py-1.5 font-normal">n</th>
                <th className="text-right px-2 py-1.5 font-normal">Recall</th>
                <th className="text-right px-2 py-1.5 font-normal">Precision</th>
                <th className="text-right px-2 py-1.5 font-normal">FPR</th>
                <th className="text-right px-2 py-1.5 font-normal">FNR</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-jh-border-lt">
                <td className="px-2 py-2 font-semibold text-jh-red">FAIL</td>
                <td className="px-2 py-2 text-right text-jh-dim">{F.support}</td>
                <td className="px-2 py-2 text-right font-bold text-jh-red">{pct(F.recall)}</td>
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
        </InstrumentPanel>

        <InstrumentPanel label="Confusion Matrix" style={{ gridArea: "matrix" }}>
          <ConfusionMatrixDisplay matrix={profile.confusionMatrix} />
          <p className="font-mono text-[10px] text-jh-dim mt-2">Positive class is FAIL. TP {profile.confusionMatrix.TP} · FP {profile.confusionMatrix.FP} · TN {profile.confusionMatrix.TN} · FN {profile.confusionMatrix.FN}</p>
        </InstrumentPanel>

        <InstrumentPanel label="Trigger Status" style={{ gridArea: "strip" }} noPadding accent={degraded ? "error" : undefined}>
          {degraded && (
            <div className="p-3 border-b border-jh-border-lt">
              {fired.map((item) => {
                const metric = item.config.type === "metric" ? item.config as MetricTriggerConfig : null;
                return (
                  <IndustrialWarning
                    key={item.config.id}
                    title="MEASUREMENT RELIABILITY DEGRADED"
                    description={item.config.rationale}
                    metric={metric ? metric.metric.replace(/_/g, " ").toUpperCase() : item.config.id}
                    observed={item.observedValue !== undefined ? `${(item.observedValue * 100).toFixed(1)}%` : "—"}
                    threshold={metric ? `${(metric.threshold * 100).toFixed(1)}%` : "—"}
                    actionLabel="INVESTIGATE EVIDENCE →"
                    actionHref="/evidence"
                  />
                );
              })}
            </div>
          )}
          <div className="px-3 py-1.5 border-b border-jh-border-lt bg-jh-bg/40 font-mono text-[10px] text-jh-dim italic">
            A trigger is evidence to investigate — not evidence that the evaluator is wrong.
          </div>
          <div className="px-3 py-1 border-b border-jh-border-lt bg-jh-bg/60 font-mono text-[9px] text-jh-dim">
            Rubric <span className="text-jh-text">{model.rubricVersion}</span>
            <span className="mx-2">·</span>
            Rep. n=<span className="text-jh-text">{model.representativeN}</span>
            <span className="mx-2">·</span>
            Risk n=<span className="text-jh-text">{model.targetedN}</span> (excl.)
          </div>
          {[...fired, ...model.triggerResults.filter((item) => !item.fired)].map((result) => (
            <TriggerCard key={result.config.id} result={result} />
          ))}
        </InstrumentPanel>
      </div>

      <div className="lg:hidden space-y-3">
        {fired.map((item) => {
          const metric = item.config.type === "metric" ? item.config as MetricTriggerConfig : null;
          return (
            <IndustrialWarning
              key={item.config.id}
              title="MEASUREMENT RELIABILITY DEGRADED"
              description={item.config.rationale}
              metric={metric ? metric.metric.replace(/_/g, " ").toUpperCase() : item.config.id}
              observed={item.observedValue !== undefined ? `${(item.observedValue * 100).toFixed(1)}%` : "—"}
              threshold={metric ? `${(metric.threshold * 100).toFixed(1)}%` : "—"}
              actionLabel="INVESTIGATE EVIDENCE →"
              actionHref="/evidence"
            />
          );
        })}
        <InstrumentPanel label="Evaluator Status">
          <ReliabilityGauge
            value={profile.perClass.FAIL.recall}
            threshold={model.gaugeThreshold}
            metricLabel="FAIL RECALL"
            fired={model.failRecallFired}
          />
        </InstrumentPanel>
        <InstrumentPanel label="Reliability Readouts" noPadding>
          <ReliabilityProfilePanel profile={profile} alertThreshold={model.gaugeThreshold} />
        </InstrumentPanel>
        <InstrumentPanel label="Confusion Matrix">
          <ConfusionMatrixDisplay matrix={profile.confusionMatrix} />
        </InstrumentPanel>
        <InstrumentPanel label="Trigger Status" noPadding>
          {model.triggerResults.map((result) => (
            <TriggerCard key={result.config.id} result={result} />
          ))}
        </InstrumentPanel>
      </div>

      <InstrumentPanel label={`Targeted / Risk Review — N=${model.targeted.total}`} noPadding>
        <div className="px-3 py-1.5 border-b border-jh-border-lt bg-amber-50/20 font-mono text-[10px] text-jh-amber">
          Diagnostic evidence only — excluded from population reliability estimates.
          <span className="text-jh-dim ml-2">{model.targeted.evaluated}/{model.targeted.total} evaluated</span>
        </div>
        <div className="grid grid-cols-2 divide-x divide-jh-border-lt font-mono">
          <div className="px-4 py-3">
            <div className="text-[9px] text-jh-dim uppercase">Reference FAIL · n={model.targeted.failN}</div>
            <div className="text-lg font-bold text-jh-green">{model.targeted.caught}/{model.targeted.failN} caught</div>
            {model.targeted.missed > 0 && <div className="text-[10px] text-jh-red">{model.targeted.missed} missed FAIL</div>}
          </div>
          <div className="px-4 py-3">
            <div className="text-[9px] text-jh-dim uppercase">Reference PASS · n={model.targeted.passN}</div>
            <div className={`text-lg font-bold ${model.targeted.falseAlarms > 0 ? "text-jh-amber" : "text-jh-green"}`}>
              {model.targeted.falseAlarms}/{model.targeted.passN} false alarms
            </div>
          </div>
        </div>
      </InstrumentPanel>
    </div>
  );
}

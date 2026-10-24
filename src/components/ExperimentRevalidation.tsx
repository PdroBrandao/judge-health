import Link from "next/link";
import {
  actionFinishCandidate,
  actionJudgeCandidateCase,
  actionStartCandidate,
} from "@/app/actions/experiment-baseline";
import { buildExperimentDashboard } from "@/core/experiment-dashboard";
import { pct } from "@/core/metrics";
import { getDataset } from "@/data/datasets";
import { FixtureRepository } from "@/data/fixture-repository";
import { getBaselineRunForExperiment, getCandidateRunForExperiment } from "@/data/experiment-run-store";
import { BaselineRunPanel } from "@/components/BaselineRunPanel";
import { ConfusionMatrixDisplay } from "@/components/confusion-matrix";
import { InstrumentPanel } from "@/components/instrument/InstrumentPanel";
import { StatusLED } from "@/components/instrument/StatusLED";
import { RevalidationClient } from "@/components/RevalidationClient";
import type { ExperimentRecord } from "@/core/types";

export function ExperimentRevalidation({ experiment }: { experiment: ExperimentRecord }) {
  const dataset = getDataset(experiment.datasetId);
  const baselineRun = getBaselineRunForExperiment(experiment.id) ?? null;
  const candidateRun = getCandidateRunForExperiment(experiment.id) ?? null;
  const candidate = experiment.workflow.configs.find(
    (item) => item.id === experiment.workflow.currentCandidateConfigId,
  ) ?? null;
  const latest = experiment.workflow.decisions.at(-1) ?? null;
  const triggers = FixtureRepository.getTriggerConfigs();

  if (!candidate || !dataset || !baselineRun) {
    return (
      <main className="min-h-screen bg-jh-bg p-3 lg:p-4">
        <div className="max-w-[900px] mx-auto space-y-4">
          <Header name={experiment.name} />
          <InstrumentPanel label={latest ? "Decision recorded" : "Workflow incomplete"} accent={latest?.decision === "accepted" ? "ok" : "warn"}>
            <div className="space-y-2 font-mono text-[11px]">
              {latest?.decision === "accepted" && (
                <p className="text-jh-green">The accepted candidate is now the baseline. A new diagnosis starts the next cycle.</p>
              )}
              {latest?.decision === "rejected" && (
                <p className="text-jh-amber">The candidate was rejected. The baseline is unchanged. Create another intervention to try again.</p>
              )}
              {!latest && (
                <p className="text-jh-dim">Revalidation opens after Diagnose and Intervention create a candidate configuration.</p>
              )}
              <div className="flex gap-2 pt-1">
                <Link href="/diagnose" className="border border-jh-border px-3 py-1.5">Diagnose →</Link>
                <Link href="/intervention" className="border border-jh-border px-3 py-1.5">Intervention →</Link>
                <Link href="/" className="border border-jh-border px-3 py-1.5">Overview →</Link>
              </div>
            </div>
          </InstrumentPanel>
        </div>
      </main>
    );
  }

  const baselineView = buildExperimentDashboard(experiment, baselineRun, dataset, triggers);
  const candidateView = candidateRun
    ? buildExperimentDashboard({ ...experiment, config: candidate }, candidateRun, dataset, triggers)
    : null;
  const ready = candidateRun?.status === "completed";
  const delta = ready && candidateView
    ? {
        agreement: candidateView.profile.overallAgreement - baselineView.profile.overallAgreement,
        recall: candidateView.profile.perClass.FAIL.recall - baselineView.profile.perClass.FAIL.recall,
        precision: candidateView.profile.perClass.FAIL.precision - baselineView.profile.perClass.FAIL.precision,
      }
    : null;
  const changes = ready && candidateView
    ? [...baselineView.representativeEvidence, ...baselineView.targetedEvidence].flatMap((row) => {
        const next = [...candidateView.representativeEvidence, ...candidateView.targetedEvidence]
          .find((item) => item.caseId === row.caseId);
        if (!next || next.evaluatorLabel === row.evaluatorLabel) return [];
        return [{ ...row, candidateLabel: next.evaluatorLabel, candidateResult: next.result }];
      })
    : [];

  return (
    <main className="min-h-screen bg-jh-bg p-3 lg:p-4">
      <div className="max-w-[1100px] mx-auto space-y-4">
        <Header name={experiment.name} />
        <div className="grid grid-cols-2 gap-3">
          <VersionCard title="Baseline · Active" version={experiment.config.version} rubric={experiment.config.rubricVersion} tone="ok" />
          <VersionCard title="Candidate · Under review" version={candidate.version} rubric={candidate.rubricVersion} tone="warn" />
        </div>

        {!ready && (
          <InstrumentPanel label="Candidate evaluation">
            <BaselineRunPanel
              initialRun={candidateRun}
              caseCount={experiment.caseIds.length}
              startAction={actionStartCandidate}
              judgeAction={actionJudgeCandidateCase}
              finishAction={actionFinishCandidate}
              idleLabel="Run Candidate Evaluation"
              runningLabel="Continue candidate"
              retryLabel="Retry failed cases"
              doneLabel="Candidate evaluation complete."
            />
          </InstrumentPanel>
        )}

        {ready && candidateView && delta && (
          <>
            <InstrumentPanel label="Metric comparison — representative sample" noPadding>
              <table className="w-full text-[10px] font-mono">
                <thead>
                  <tr className="border-b border-jh-border bg-jh-bg/60 text-jh-dim">
                    <th className="text-left px-3 py-2 font-normal">Metric</th>
                    <th className="text-right px-3 py-2 font-normal">Baseline</th>
                    <th className="text-right px-3 py-2 font-normal">Candidate</th>
                    <th className="text-right px-3 py-2 font-normal">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  <MetricRow label="Overall agreement" base={baselineView.profile.overallAgreement} next={candidateView.profile.overallAgreement} delta={delta.agreement} />
                  <MetricRow label="FAIL recall" base={baselineView.profile.perClass.FAIL.recall} next={candidateView.profile.perClass.FAIL.recall} delta={delta.recall} />
                  <MetricRow label="FAIL precision" base={baselineView.profile.perClass.FAIL.precision} next={candidateView.profile.perClass.FAIL.precision} delta={delta.precision} />
                  <CountRow label="FP" base={baselineView.profile.confusionMatrix.FP} next={candidateView.profile.confusionMatrix.FP} />
                  <CountRow label="FN" base={baselineView.profile.confusionMatrix.FN} next={candidateView.profile.confusionMatrix.FN} />
                </tbody>
              </table>
              <p className="px-3 py-2 font-mono text-[10px] text-jh-dim border-t border-jh-border-lt">
                Representative n={baselineView.representativeN}. Targeted/risk cases are excluded from these estimates.
              </p>
            </InstrumentPanel>
            <div className="grid lg:grid-cols-2 gap-3">
              <InstrumentPanel label="Baseline confusion matrix">
                <ConfusionMatrixDisplay matrix={baselineView.profile.confusionMatrix} />
              </InstrumentPanel>
              <InstrumentPanel label="Candidate confusion matrix">
                <ConfusionMatrixDisplay matrix={candidateView.profile.confusionMatrix} />
              </InstrumentPanel>
            </div>
            <InstrumentPanel label="Targeted / risk guardrail" noPadding>
              <div className="grid grid-cols-2 divide-x divide-jh-border-lt font-mono text-[10px]">
                <Guard title="Baseline" caught={baselineView.targeted.caught} missed={baselineView.targeted.missed} alarms={baselineView.targeted.falseAlarms} />
                <Guard title="Candidate" caught={candidateView.targeted.caught} missed={candidateView.targeted.missed} alarms={candidateView.targeted.falseAlarms} />
              </div>
            </InstrumentPanel>
            <InstrumentPanel label={`Judgment changes — ${changes.length}`} noPadding>
              {changes.length === 0 && (
                <p className="px-3 py-3 font-mono text-[10px] text-jh-dim">No case changed label between baseline and candidate.</p>
              )}
              {changes.map((row) => (
                <Link key={row.caseId} href={`/evidence/${row.caseId}`} className="flex gap-3 px-3 py-2 border-b border-jh-border-lt font-mono text-[10px] hover:bg-jh-bg">
                  <span className="w-28 text-jh-text">{row.caseId}</span>
                  <span className="text-jh-dim">{row.sampleType === "targeted_risk" ? "risk" : "rep"}</span>
                  <span>{row.evaluatorLabel} → {row.candidateLabel}</span>
                  <span className="text-jh-dim">{row.result} → {row.candidateResult}</span>
                </Link>
              ))}
            </InstrumentPanel>
            <RevalidationClient
              candidateId={candidate.id}
              baselineVersion={experiment.config.version}
              candidateVersion={candidate.version}
              deltaFailRecall={delta.recall}
              existingDecision={null}
              liveRunsComplete
              baselineIsLive
              candidateIsLive
              experimentId={experiment.id}
              resultLabel={experiment.name}
            />
          </>
        )}
      </div>
    </main>
  );
}

function Header({ name }: { name: string }) {
  return (
    <div className="border-b border-jh-border-lt pb-3">
      <h2 className="font-sketch text-[1.8rem] font-bold leading-none tracking-wide text-jh-text">Revalidation</h2>
      <p className="font-mono text-[11px] text-jh-dim mt-1">{name}. Candidate versus the current baseline.</p>
    </div>
  );
}

function VersionCard({ title, version, rubric, tone }: { title: string; version: string; rubric: string; tone: "ok" | "warn" }) {
  return (
    <div className={`border bg-jh-panel p-3 space-y-1 ${tone === "ok" ? "border-jh-border" : "border-jh-amber/60"}`}>
      <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-jh-dim">{title}</div>
      <div className="font-mono text-base font-bold text-jh-text">{version}</div>
      <div className="flex items-center gap-2">
        <StatusLED status={tone === "ok" ? "ok" : "warning"} size="sm" />
        <span className="font-mono text-[10px] text-jh-dim">Rubric {rubric}</span>
      </div>
    </div>
  );
}

function MetricRow({ label, base, next, delta }: { label: string; base: number; next: number; delta: number }) {
  const better = delta > 0.001;
  const worse = delta < -0.001;
  return (
    <tr className="border-b border-jh-border-lt">
      <td className="px-3 py-2">{label}</td>
      <td className="px-3 py-2 text-right">{pct(base)}</td>
      <td className="px-3 py-2 text-right">{pct(next)}</td>
      <td className={`px-3 py-2 text-right ${better ? "text-jh-green" : worse ? "text-jh-red" : "text-jh-dim"}`}>
        {delta >= 0 ? "+" : ""}{pct(delta)}
      </td>
    </tr>
  );
}

function CountRow({ label, base, next }: { label: string; base: number; next: number }) {
  return (
    <tr className="border-b border-jh-border-lt">
      <td className="px-3 py-2">{label}</td>
      <td className="px-3 py-2 text-right">{base}</td>
      <td className="px-3 py-2 text-right">{next}</td>
      <td className="px-3 py-2 text-right text-jh-dim">{next - base >= 0 ? "+" : ""}{next - base}</td>
    </tr>
  );
}

function Guard({ title, caught, missed, alarms }: { title: string; caught: number; missed: number; alarms: number }) {
  return (
    <div className="px-4 py-3 space-y-1">
      <div className="text-jh-dim uppercase">{title}</div>
      <div>Caught {caught}</div>
      <div>Missed {missed}</div>
      <div>False alarms {alarms}</div>
    </div>
  );
}

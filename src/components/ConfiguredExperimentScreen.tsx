import type { ReactNode } from "react";
import Link from "next/link";
import { datasetCounts, getDataset } from "@/data/datasets";
import { getBaselineRunForExperiment } from "@/data/experiment-run-store";
import { InstrumentPanel } from "@/components/instrument/InstrumentPanel";
import type { ExperimentRecord } from "@/core/types";

export function ConfiguredExperimentScreen({
  experiment,
  showOverviewLink = true,
  children,
}: {
  experiment: ExperimentRecord;
  showOverviewLink?: boolean;
  children?: ReactNode;
}) {
  const dataset = getDataset(experiment.datasetId);
  const counts = dataset ? datasetCounts(dataset) : null;
  const run = getBaselineRunForExperiment(experiment.id);
  const subtitle = !run
    ? "Configured experiment. Evaluation has not been run."
    : run.status === "completed"
      ? "Live baseline is complete."
      : run.status === "failed"
        ? "The baseline failed. It is not a completed evaluation."
        : run.status === "partial_failure"
          ? "The baseline finished with failed cases. It is not a completed evaluation."
          : "Baseline evaluation is in progress.";

  return (
    <main className="min-h-screen bg-jh-bg p-3 lg:p-4">
      <div className="max-w-[900px] mx-auto space-y-3">
        <div className="border-b border-jh-border-lt pb-3">
          <h2 className="font-sketch text-[1.6rem] font-bold leading-none tracking-wide text-jh-text">
            {experiment.name}
          </h2>
          <p className="font-mono text-[11px] text-jh-dim mt-1">
            {subtitle}
          </p>
        </div>

        <InstrumentPanel label="Frozen sample">
          <div className="space-y-2 font-mono text-[11px]">
            <div>
              <span className="text-jh-dim">Dataset · </span>
              <span className="text-jh-text">{dataset?.name ?? experiment.datasetId}</span>
            </div>
            <div>
              <span className="text-jh-dim">Cases · </span>
              <span className="text-jh-text">{experiment.caseIds.length}</span>
              {counts && (
                <span className="text-jh-dim">
                  {" "}· {counts.representative} representative · {counts.targeted} targeted/risk
                </span>
              )}
            </div>
            {dataset?.demonstration && (
              <p className="border border-jh-amber/50 bg-amber-50/30 text-jh-amber px-3 py-2">
                Synthetic demonstration data. Not a statistically validated calibration.
              </p>
            )}
            <Link
              href={`/datasets/${experiment.datasetId}`}
              className="inline-block border border-jh-border px-3 py-1.5 text-jh-text hover:bg-jh-bg"
            >
              Inspect cases →
            </Link>
          </div>
        </InstrumentPanel>

        <InstrumentPanel label="Evaluator configuration">
          <div className="space-y-2 font-mono text-[11px]">
            <Row label="Model" value={experiment.config.modelId} />
            <Row label="Config" value={experiment.config.version} />
            <Row label="Rubric" value={experiment.config.rubricVersion} />
            <Row label="Max tokens" value={String(experiment.config.inference.maxCompletionTokens)} />
            <Row label="Response" value={experiment.config.inference.responseFormat} />
            <div className="pt-2 border-t border-jh-border-lt">
              <div className="text-[9px] uppercase tracking-[0.12em] text-jh-dim mb-1">Rubric text</div>
              <pre className="text-jh-text text-[10px] bg-jh-bg/60 border border-jh-border-lt p-2 overflow-auto max-h-48 whitespace-pre-wrap leading-relaxed">
                {experiment.config.rubricText}
              </pre>
            </div>
          </div>
        </InstrumentPanel>

        {children}

        <div className="flex gap-4">
          <Link href="/experiments" className="inline-block font-mono text-[10px] text-jh-dim hover:text-jh-text">
            ← Experiments
          </Link>
          {showOverviewLink && (
            <Link href="/" className="inline-block font-mono text-[10px] text-jh-dim hover:text-jh-text">
              Baseline on Overview →
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-jh-dim w-28 shrink-0">{label}</span>
      <span className="text-jh-text">{value}</span>
    </div>
  );
}

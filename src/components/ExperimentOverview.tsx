import Link from "next/link";
import { buildExperimentDashboard } from "@/core/experiment-dashboard";
import { getDataset } from "@/data/datasets";
import { FixtureRepository } from "@/data/fixture-repository";
import { getBaselineRunForExperiment } from "@/data/experiment-run-store";
import { BaselineResults } from "@/components/BaselineResults";
import { BaselineRunPanel } from "@/components/BaselineRunPanel";
import { ConfiguredExperimentScreen } from "@/components/ConfiguredExperimentScreen";
import { ReliabilityDashboard } from "@/components/ReliabilityDashboard";
import { InstrumentPanel } from "@/components/instrument/InstrumentPanel";
import type { ExperimentRecord } from "@/core/types";

export function ExperimentOverview({ experiment }: { experiment: ExperimentRecord }) {
  const run = getBaselineRunForExperiment(experiment.id) ?? null;
  const dataset = getDataset(experiment.datasetId);
  const dashboard = dataset
    ? buildExperimentDashboard(experiment, run, dataset, FixtureRepository.getTriggerConfigs())
    : null;
  const showDashboard = dashboard?.measured && run?.status === "completed";

  return (
    <ConfiguredExperimentScreen experiment={experiment} showOverviewLink={false}>
      {!showDashboard && (
        <InstrumentPanel label="Baseline evaluation">
          <BaselineRunPanel initialRun={run} caseCount={experiment.caseIds.length} />
        </InstrumentPanel>
      )}
      {showDashboard && dashboard && <ReliabilityDashboard model={dashboard} />}
      {run && dataset && run.status !== "completed" && <BaselineResults run={run} dataset={dataset} />}
      {!run && (
        <p className="font-mono text-[10px] text-jh-dim">
          No baseline has been stored yet.
          <Link href={`/datasets/${experiment.datasetId}`} className="ml-2 text-jh-text hover:underline">
            Inspect the frozen cases
          </Link>
        </p>
      )}
      {showDashboard && (
        <Link href="/evidence" className="inline-block font-mono text-[11px] border border-jh-border px-3 py-1.5 text-jh-text hover:bg-jh-bg">
          Inspect evidence →
        </Link>
      )}
    </ConfiguredExperimentScreen>
  );
}

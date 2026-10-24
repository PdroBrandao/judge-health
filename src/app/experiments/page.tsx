import Link from "next/link";
import { datasetCounts, getDataset } from "@/data/datasets";
import { HISTORICAL_EXPERIMENT_ID } from "@/data/historical-experiment";
import {
  getActiveExperimentId,
  listStoredExperiments,
} from "@/data/experiment-store";
import { actionSelectExperiment } from "@/app/actions/experiments";
import { HistoricalReadOnlyNotice } from "@/components/HistoricalReadOnlyNotice";
import { InstrumentPanel } from "@/components/instrument/InstrumentPanel";

export default function ExperimentsPage() {
  const activeId = getActiveExperimentId();
  const stored = listStoredExperiments();
  const historical = getDataset("historical-70");
  const historicalCounts = historical ? datasetCounts(historical) : null;

  return (
    <main className="min-h-screen bg-jh-bg p-3 lg:p-4">
      <div className="max-w-[900px] mx-auto space-y-3">
        <div className="border-b border-jh-border-lt pb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-sketch text-[1.6rem] font-bold leading-none tracking-wide text-jh-text">
              Experiments
            </h2>
            <p className="font-mono text-[11px] text-jh-dim mt-1">
              Choose a named experiment. Run #0001 stays archived.
            </p>
          </div>
          <Link
            href="/experiments/new"
            className="font-mono text-[11px] border border-jh-border px-3 py-1.5 text-jh-text hover:bg-jh-bg"
          >
            New Experiment →
          </Link>
        </div>

        <InstrumentPanel label={activeId === HISTORICAL_EXPERIMENT_ID ? "Active · archived" : "Archived"}>
          <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-mono text-[13px] font-semibold text-jh-text">Run #0001</h3>
                <p className="font-mono text-[10px] text-jh-dim mt-1">
                  {historicalCounts
                    ? `${historicalCounts.total} historical cases · ${historicalCounts.representative} representative · ${historicalCounts.targeted} targeted/risk`
                    : "Historical calibration set"}
                </p>
              </div>
              <SelectButton id={HISTORICAL_EXPERIMENT_ID} active={activeId === HISTORICAL_EXPERIMENT_ID} />
            </div>
            <HistoricalReadOnlyNotice />
          </div>
        </InstrumentPanel>

        {stored.map((experiment) => {
          const dataset = getDataset(experiment.datasetId);
          return (
            <InstrumentPanel key={experiment.id} label={experiment.id === activeId ? "Active" : "Configured"}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1 font-mono text-[10px]">
                  <h3 className="text-[13px] font-semibold text-jh-text">{experiment.name}</h3>
                  <p className="text-jh-dim">
                    {dataset?.name ?? experiment.datasetId} · {experiment.caseIds.length} frozen cases
                  </p>
                  <p className="text-jh-dim">
                    {experiment.config.modelId} · {experiment.config.rubricVersion} · {experiment.config.version}
                  </p>
                </div>
                <SelectButton id={experiment.id} active={experiment.id === activeId} />
              </div>
            </InstrumentPanel>
          );
        })}

        {stored.length === 0 && (
          <p className="font-mono text-[10px] text-jh-dim">
            No named experiments yet.
          </p>
        )}
      </div>
    </main>
  );
}

function SelectButton({ id, active }: { id: string; active: boolean }) {
  if (active) {
    return (
      <span className="font-mono text-[10px] border border-jh-green/50 text-jh-green px-3 py-1.5">
        Active
      </span>
    );
  }
  return (
    <form action={actionSelectExperiment}>
      <input type="hidden" name="experimentId" value={id} />
      <button
        type="submit"
        className="font-mono text-[11px] border border-jh-border px-3 py-1.5 text-jh-text hover:bg-jh-bg"
      >
        Open →
      </button>
    </form>
  );
}

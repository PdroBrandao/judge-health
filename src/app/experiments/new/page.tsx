import Link from "next/link";
import { datasetCounts, listDatasets } from "@/data/datasets";
import { EXISTING_RUBRICS } from "@/data/evaluator-models";
import { describeConfiguredModels } from "@/data/model-availability";
import { NewExperimentForm } from "@/components/NewExperimentForm";
import { InstrumentPanel } from "@/components/instrument/InstrumentPanel";

export default async function NewExperimentPage() {
  const models = await describeConfiguredModels();
  const datasets = listDatasets().map((dataset) => {
    const counts = datasetCounts(dataset);
    return {
      id: dataset.id,
      name: dataset.name,
      description: dataset.description,
      total: counts.total,
      representative: counts.representative,
      targeted: counts.targeted,
      demonstration: dataset.demonstration,
    };
  });

  return (
    <main className="min-h-screen bg-jh-bg p-3 lg:p-4">
      <div className="max-w-[900px] mx-auto space-y-3">
        <div className="border-b border-jh-border-lt pb-3">
          <Link href="/experiments" className="font-mono text-[10px] text-jh-dim hover:text-jh-text">
            ← Experiments
          </Link>
          <h2 className="font-sketch text-[1.6rem] font-bold leading-none tracking-wide text-jh-text mt-1">
            New Experiment
          </h2>
          <p className="font-mono text-[11px] text-jh-dim mt-1">
            The sample, model, rubric, and inference parameters are stored with the experiment. Run #0001 is not changed.
          </p>
        </div>
        <InstrumentPanel label="Experiment configuration">
          <NewExperimentForm
            datasets={datasets}
            models={models}
            rubrics={EXISTING_RUBRICS.map((rubric) => ({
              version: rubric.version,
              label: rubric.label,
              text: rubric.text,
            }))}
          />
        </InstrumentPanel>
      </div>
    </main>
  );
}

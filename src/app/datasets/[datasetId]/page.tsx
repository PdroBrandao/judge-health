import Link from "next/link";
import { notFound } from "next/navigation";
import { datasetCounts, getDataset } from "@/data/datasets";
import { DatasetCaseBrowser } from "@/components/DatasetCaseBrowser";
import { InstrumentPanel } from "@/components/instrument/InstrumentPanel";

export default async function DatasetDetailPage({
  params,
}: {
  params: Promise<{ datasetId: string }>;
}) {
  const { datasetId } = await params;
  const dataset = getDataset(datasetId);
  if (!dataset) notFound();
  const counts = datasetCounts(dataset);

  return (
    <main className="min-h-screen bg-jh-bg p-3 lg:p-4">
      <div className="max-w-[1000px] mx-auto space-y-3">
        <div className="border-b border-jh-border-lt pb-3">
          <Link href="/datasets" className="font-mono text-[10px] text-jh-dim hover:text-jh-text">
            ← Datasets
          </Link>
          <h2 className="font-sketch text-[1.6rem] font-bold leading-none tracking-wide text-jh-text mt-1">
            {dataset.name}
          </h2>
          <p className="font-mono text-[11px] text-jh-dim mt-1">
            {counts.representative} representative · {counts.targeted} targeted/risk · {counts.pass} PASS · {counts.fail} FAIL
          </p>
        </div>

        {dataset.demonstration && (
          <p className="font-mono text-[10px] border border-jh-amber/50 bg-amber-50/30 text-jh-amber px-3 py-2">
            Synthetic demonstration data. Not a statistically validated calibration. Ground-truth labels on this page are not sent to the evaluator.
          </p>
        )}

        <InstrumentPanel
          label={dataset.origin === "synthetic" ? "Synthetic cases" : "Historical cases"}
          noPadding
        >
          <DatasetCaseBrowser cases={dataset.cases} />
        </InstrumentPanel>
      </div>
    </main>
  );
}

import Link from "next/link";
import { datasetCounts, listDatasets } from "@/data/datasets";
import { InstrumentPanel } from "@/components/instrument/InstrumentPanel";
export default function DatasetsPage() {
  const datasets = listDatasets();

  return (
    <main className="min-h-screen bg-jh-bg p-3 lg:p-4">
      <div className="max-w-[900px] mx-auto space-y-3">
        <div className="border-b border-jh-border-lt pb-3">
          <h2 className="font-sketch text-[1.6rem] font-bold leading-none tracking-wide text-jh-text">
            Datasets
          </h2>
          <p className="font-mono text-[11px] text-jh-dim mt-1">
            Inspect inputs, agent outputs, and ground-truth labels before an experiment starts.
          </p>
        </div>

        {datasets.map((dataset) => {
          const counts = datasetCounts(dataset);
          return (
            <InstrumentPanel key={dataset.id} label={dataset.origin === "synthetic" ? "Synthetic demonstration" : "Historical fixture"}>
              <div className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-mono text-[13px] font-semibold text-jh-text">{dataset.name}</h3>
                    <p className="font-mono text-[10px] text-jh-dim mt-1 max-w-[640px] leading-relaxed">
                      {dataset.description}
                    </p>
                  </div>
                  <Link
                    href={`/datasets/${dataset.id}`}
                    className="font-mono text-[11px] border border-jh-border px-3 py-1.5 text-jh-text hover:bg-jh-bg"
                  >
                    Inspect cases →
                  </Link>
                </div>
                {dataset.demonstration && (
                  <p className="font-mono text-[10px] border border-jh-amber/50 bg-amber-50/30 text-jh-amber px-3 py-2">
                    Synthetic demonstration data. Not a statistically validated calibration.
                  </p>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[10px]">
                  <Count label="Cases" value={String(counts.total)} />
                  <Count label="Representative" value={String(counts.representative)} />
                  <Count label="Targeted/risk" value={String(counts.targeted)} />
                  <Count label="PASS / FAIL" value={`${counts.pass} / ${counts.fail}`} />
                </div>
              </div>
            </InstrumentPanel>
          );
        })}
      </div>
    </main>
  );
}

function Count({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-jh-border-lt px-2 py-2">
      <div className="text-[9px] uppercase tracking-wide text-jh-dim">{label}</div>
      <div className="text-jh-text font-semibold mt-1">{value}</div>
    </div>
  );
}

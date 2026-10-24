// ============================================================
// Dataset registry.
//
// The historical set is the existing 70-case fixture.
// The demo set is a separate 10-case synthetic sample.
// Neither registry writes experiment data.
// ============================================================
import type { Label, SampleType } from "@/core/types";
import { allCases } from "@/data/fixtures/cases";
import { getCaseContent } from "@/data/fixtures/case-content";
import { demoCases } from "@/data/fixtures/demo-10";

export type DatasetOrigin = "historical" | "synthetic";

export interface DatasetCase {
  id: string;
  groundTruth: Label;
  sampleType: SampleType;
  input: string;
  systemOutput: string;
  hasContent: boolean;
}

export interface EvaluationDataset {
  id: string;
  name: string;
  origin: DatasetOrigin;
  /** True only for the small synthetic demonstration sample. */
  demonstration: boolean;
  description: string;
  cases: DatasetCase[];
}

export interface DatasetCounts {
  total: number;
  representative: number;
  targeted: number;
  pass: number;
  fail: number;
}

const historicalDataset: EvaluationDataset = {
  id: "historical-70",
  name: "Historical calibration set",
  origin: "historical",
  demonstration: false,
  description: "The 70 cases used by Run #0001. 60 representative cases support population estimates. 10 targeted/risk cases are investigation-only.",
  cases: allCases.map((item) => {
    const content = getCaseContent(item.id);
    return {
      id: item.id,
      groundTruth: item.groundTruth,
      sampleType: item.sampleType,
      input: content?.input ?? "",
      systemOutput: content?.systemOutput ?? "",
      hasContent: Boolean(content),
    };
  }),
};

const demoDataset: EvaluationDataset = {
  id: "demo-10",
  name: "Synthetic demonstration set",
  origin: "synthetic",
  demonstration: true,
  description: "Ten synthetic cases for a live demonstration. This is not a statistically validated calibration sample.",
  cases: demoCases.map((item) => ({
    id: item.id,
    groundTruth: item.groundTruth,
    sampleType: item.sampleType,
    input: item.input,
    systemOutput: item.systemOutput,
    hasContent: true,
  })),
};

const DATASETS: EvaluationDataset[] = [historicalDataset, demoDataset];

export function listDatasets(): EvaluationDataset[] {
  return DATASETS;
}

export function getDataset(id: string): EvaluationDataset | undefined {
  return DATASETS.find((dataset) => dataset.id === id);
}

export function datasetCounts(dataset: EvaluationDataset): DatasetCounts {
  return {
    total: dataset.cases.length,
    representative: dataset.cases.filter((item) => item.sampleType === "representative").length,
    targeted: dataset.cases.filter((item) => item.sampleType === "targeted_risk").length,
    pass: dataset.cases.filter((item) => item.groundTruth === "PASS").length,
    fail: dataset.cases.filter((item) => item.groundTruth === "FAIL").length,
  };
}

// ============================================================
// Dataset registry and evaluator prompt isolation.
// ============================================================
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { buildSystemPrompt, buildUserPrompt } from "@/core/evaluator/openai-evaluator";
import type { EvaluatorInput } from "@/core/evaluator/evaluator-adapter";
import { datasetCounts, getDataset, listDatasets } from "@/data/datasets";
import { allCases } from "@/data/fixtures/cases";

describe("dataset registry", () => {
  const datasets = listDatasets();
  const historical = getDataset("historical-70");
  const demo = getDataset("demo-10");

  it("registers the historical 70-case set and the synthetic 10-case set", () => {
    expect(datasets.map((dataset) => dataset.id)).toEqual(["historical-70", "demo-10"]);
    expect(historical).toBeDefined();
    expect(demo).toBeDefined();
  });

  it("keeps the historical sample split and does not alter the original cases", () => {
    const counts = datasetCounts(historical!);
    expect(counts).toMatchObject({ total: 70, representative: 60, targeted: 10 });
    expect(allCases).toHaveLength(70);
    expect(historical!.cases.map((item) => item.id)).toEqual(allCases.map((item) => item.id));
    expect(historical!.cases.map((item) => item.groundTruth)).toEqual(allCases.map((item) => item.groundTruth));
    expect(historical!.demonstration).toBe(false);
  });

  it("marks the 10-case set as a synthetic demonstration with 8 representative and 2 targeted cases", () => {
    const counts = datasetCounts(demo!);
    expect(counts).toMatchObject({ total: 10, representative: 8, targeted: 2 });
    expect(demo!.origin).toBe("synthetic");
    expect(demo!.demonstration).toBe(true);
    expect(demo!.cases.every((item) => item.hasContent)).toBe(true);
  });

  it("uses stable ids that are unique inside and across datasets", () => {
    const ids = datasets.flatMap((dataset) => dataset.cases.map((item) => item.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(demo!.cases.map((item) => item.id)).toEqual([
      "demo-rep-001",
      "demo-rep-002",
      "demo-rep-003",
      "demo-rep-004",
      "demo-rep-005",
      "demo-rep-006",
      "demo-rep-007",
      "demo-rep-008",
      "demo-trg-001",
      "demo-trg-002",
    ]);
    expect(ids.some((id) => allCases.some((item) => item.id === id && id.startsWith("demo-")))).toBe(false);
  });
});

describe("dataset ground truth stays out of the evaluator prompt", () => {
  it("builds each dataset prompt without the reference label", () => {
    const rubricText = "Classify the response as PASS or FAIL using only the rubric.";
    for (const dataset of listDatasets()) {
      for (const item of dataset.cases) {
        const input: EvaluatorInput = {
          caseId: item.id,
          input: item.input,
          systemOutput: item.systemOutput,
          rubricText,
          evaluatorVersion: "v-test",
          rubricVersion: "rubric-test",
        };
        expect(Object.keys(input)).not.toContain("groundTruth");
        const prompt = buildUserPrompt(input);
        expect(prompt).toContain(item.input);
        expect(prompt).toContain(item.systemOutput);
        expect(prompt).not.toMatch(/groundTruth/i);
        expect(prompt).not.toContain(`Ground truth: ${item.groundTruth}`);
        expect(prompt).not.toContain(`Reference label: ${item.groundTruth}`);
      }
    }
    expect(buildSystemPrompt()).not.toMatch(/groundTruth/i);
  });
});

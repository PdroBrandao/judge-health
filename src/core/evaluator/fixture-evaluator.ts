// ============================================================
// FixtureEvaluator — deterministic evaluator from pre-computed judgments
//
// Returns pre-computed fixture judgments. Never calls the network.
// Used in:
//   - automated tests (no API cost)
//   - DEMO / FIXTURE mode (reproducible demonstrations)
//   - development without an API key
//
// The fixture judgments live in src/data/fixtures/judgments.ts.
// ============================================================
import type { EvaluatorAdapter, EvaluatorInput, EvaluatorOutput } from "./evaluator-adapter";
import { baselineJudgments, candidateJudgments } from "@/data/fixtures";

export class FixtureEvaluator implements EvaluatorAdapter {
  readonly mode = "fixture" as const;

  constructor(private readonly runType: "baseline" | "candidate" = "baseline") {}

  async judgeCase(input: EvaluatorInput): Promise<EvaluatorOutput> {
    const judgments =
      this.runType === "baseline" ? baselineJudgments : candidateJudgments;

    const judgment = judgments.find((j) => j.caseId === input.caseId);
    if (!judgment) {
      // Default PASS for cases without a fixture judgment
      return { label: "PASS", rationale: "No fixture judgment — defaulting to PASS." };
    }
    return {
      label: judgment.predictedLabel,
      // Fixture evaluator rationale is generic — the detailed rationale
      // is in CaseContent.evaluatorRationale for display purposes.
      rationale: `Fixture judgment: ${judgment.predictedLabel}. See case content for evaluator rationale.`,
    };
  }
}

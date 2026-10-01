// ============================================================
// EvaluatorAdapter — abstract interface for binary PASS/FAIL evaluation
//
// The core Judge Health workflow depends ONLY on this interface.
// OpenAI and fixture implementations are injected at the call site.
//
// Critical invariant: the evaluator must NEVER receive:
//   - groundTruth (the reference label)
//   - humanReference.label
//   - expected result
//   - any confusion-matrix classification
//
// Only the rubric, input, and systemOutput are permitted in the
// evaluator prompt. Verified by tests/evaluator.test.ts.
// ============================================================

import type { LiveJudgment } from "@/core/types";

/** All inputs the evaluator is permitted to see. No reference labels. */
export interface EvaluatorInput {
  caseId: string;
  /** User message / conversation context being evaluated */
  input: string;
  /** AI system output that is the subject of evaluation */
  systemOutput: string;
  /** The full rubric text for this evaluator version */
  rubricText: string;
  evaluatorVersion: string;
  rubricVersion: string;
}

/** Structured output from the evaluator. Always PASS or FAIL + rationale. */
export interface EvaluatorOutput {
  label: "PASS" | "FAIL";
  rationale: string;
}

export interface EvaluatorAdapter {
  /** Identifies the execution mode. Used for UI badges. */
  readonly mode: "fixture" | "live";
  /**
   * Evaluate a single case.
   * Returns structured output; throws on unrecoverable errors.
   * The caller (server action) catches and records RunError on failure.
   */
  judgeCase(input: EvaluatorInput): Promise<EvaluatorOutput>;
}

/**
 * Convert an EvaluatorOutput to a LiveJudgment for storage.
 * Adds metadata fields: model, evaluator/rubric version, timestamp.
 */
export function toJudgment(
  input: EvaluatorInput,
  output: EvaluatorOutput,
  model: string,
  usageTokens?: number
): LiveJudgment {
  return {
    caseId: input.caseId,
    label: output.label,
    rationale: output.rationale,
    model,
    evaluatorVersion: input.evaluatorVersion,
    rubricVersion: input.rubricVersion,
    timestamp: new Date().toISOString(),
    usageTokens,
  };
}

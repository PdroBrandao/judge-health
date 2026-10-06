"use server";
// ============================================================
// Run Server Actions — Live Evaluation Execution
//
// All OpenAI calls execute server-side through these actions.
// The API key is read from process.env and never serialized
// to the client.
//
// Execution model: client-side loop, one actionJudgeCase per case.
// This gives real-time progress updates (0/60 → 60/60) with
// individual error isolation.
// ============================================================
import { revalidatePath } from "next/cache";
import { RunStore, liveJudgmentsToJudgments } from "@/data/run-store";
import { WorkflowStore } from "@/data/workflow-store";
import { FixtureRepository } from "@/data/fixture-repository";
import { OpenAIEvaluator } from "@/core/evaluator/openai-evaluator";
import { toJudgment } from "@/core/evaluator/evaluator-adapter";
import type { EvaluationRun, LiveJudgment } from "@/core/types";

// ── 1. Create Run ─────────────────────────────────────────────
export interface CreateRunParams {
  type: "baseline" | "candidate";
  mode: "fixture" | "live";
  evaluatorVersion: string;
  rubricVersion: string;
  taxonomyVersion: string;
  sampleIds: string[];
  /** Rubric text stored in run for audit trail */
  rubricText: string;
}

export async function actionCreateRun(
  params: CreateRunParams
): Promise<{ runId: string }> {
  const model = params.mode === "live"
    ? (process.env.OPENAI_EVALUATOR_MODEL ?? "unknown")
    : "fixture";

  const run = RunStore.createRun({
    type: params.type,
    mode: params.mode,
    evaluatorVersion: params.evaluatorVersion,
    rubricVersion: params.rubricVersion,
    taxonomyVersion: params.taxonomyVersion,
    model,
    sampleIds: params.sampleIds,
  });

  // Wire the run ID into the appropriate WorkflowStore slot.
  if (params.type === "baseline") {
    WorkflowStore.setBaselineRunId(run.runId);
  } else {
    // Candidate run: attach to the current CandidateRecord so the
    // revalidation page can do an ID-scoped lookup instead of "latest by type".
    WorkflowStore.setCurrentCandidateRunId(run.runId);
  }

  RunStore.startRun(run.runId);
  return { runId: run.runId };
}

// ── 2. Judge a single case ────────────────────────────────────
export interface JudgeCaseParams {
  runId: string;
  caseId: string;
  rubricText: string;
  evaluatorVersion: string;
  rubricVersion: string;
}

export type JudgeCaseResult =
  | { ok: true;  judgment: LiveJudgment }
  | { ok: false; error: string };

export async function actionJudgeCase(
  params: JudgeCaseParams
): Promise<JudgeCaseResult> {
  const { runId, caseId, rubricText, evaluatorVersion, rubricVersion } = params;

  // Get case content (input + systemOutput) from fixture
  const content = FixtureRepository.getCaseContent(caseId);
  if (!content) {
    const error = `No case content for ${caseId} — cannot evaluate.`;
    RunStore.addError(runId, {
      caseId,
      error,
      timestamp: new Date().toISOString(),
    });
    return { ok: false, error };
  }

  const run = RunStore.getRun(runId);
  if (!run) {
    return { ok: false, error: `Run ${runId} not found.` };
  }

  // Check if already judged (idempotent)
  if (run.judgments.some((j) => j.caseId === caseId)) {
    return { ok: true, judgment: run.judgments.find((j) => j.caseId === caseId)! };
  }

  const evaluatorInput = {
    caseId,
    input: content.input,
    systemOutput: content.systemOutput,
    rubricText,
    evaluatorVersion,
    rubricVersion,
  };

  try {
    const evaluator = new OpenAIEvaluator();
    const result = await evaluator.judgeCaseWithUsage(evaluatorInput);
    const judgment = toJudgment(
      evaluatorInput,
      { label: result.label, rationale: result.rationale },
      run.model,
      result.usageTokens
    );
    RunStore.addJudgment(runId, judgment);
    return { ok: true, judgment };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    RunStore.addError(runId, {
      caseId,
      error,
      timestamp: new Date().toISOString(),
    });
    return { ok: false, error };
  }
}

// ── 3. Complete a run ─────────────────────────────────────────
export async function actionCompleteRun(
  runId: string
): Promise<{ run: EvaluationRun }> {
  const run = RunStore.completeRun(runId);
  revalidatePath("/");
  revalidatePath("/evidence");
  revalidatePath("/revalidation");
  revalidatePath("/history");
  return { run };
}

// ── 4. Retry a failed case ────────────────────────────────────
export async function actionRetryCase(
  params: JudgeCaseParams
): Promise<JudgeCaseResult> {
  const { runId, caseId, rubricText, evaluatorVersion, rubricVersion } = params;

  const content = FixtureRepository.getCaseContent(caseId);
  if (!content) {
    return { ok: false, error: `No case content for ${caseId}.` };
  }

  const run = RunStore.getRun(runId);
  if (!run) return { ok: false, error: `Run ${runId} not found.` };

  const evaluatorInput = {
    caseId,
    input: content.input,
    systemOutput: content.systemOutput,
    rubricText,
    evaluatorVersion,
    rubricVersion,
  };

  try {
    const evaluator = new OpenAIEvaluator();
    const result = await evaluator.judgeCaseWithUsage(evaluatorInput);
    const judgment = toJudgment(
      evaluatorInput,
      { label: result.label, rationale: result.rationale },
      run.model,
      result.usageTokens
    );
    RunStore.resolveError(runId, caseId, judgment);
    return { ok: true, judgment };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, error };
  }
}

// ── 5. Get run summary for client ─────────────────────────────
// Read-only — returns serializable run data.
export async function actionGetRun(
  runId: string
): Promise<EvaluationRun | null> {
  return RunStore.getRun(runId) ?? null;
}

// ── Helper: convert live judgments for metrics engine ─────────
export { liveJudgmentsToJudgments };

// ── 6. Smoke test a single case (no RunStore side effects) ────
// Used to verify the evaluator can handle a case before a full run.
export interface SmokeTestResult {
  ok: boolean;
  caseId: string;
  label?: "PASS" | "FAIL";
  rationale?: string;
  error?: string;
  durationMs: number;
}

export async function actionSmokeTest(params: {
  caseId: string;
  rubricText: string;
  evaluatorVersion: string;
  rubricVersion: string;
}): Promise<SmokeTestResult> {
  const { caseId, rubricText, evaluatorVersion, rubricVersion } = params;
  const t0 = Date.now();

  const content = FixtureRepository.getCaseContent(caseId);
  if (!content) {
    return { ok: false, caseId, error: `No case content for ${caseId}.`, durationMs: Date.now() - t0 };
  }

  const evaluatorInput = {
    caseId,
    input: content.input,
    systemOutput: content.systemOutput,
    rubricText,
    evaluatorVersion,
    rubricVersion,
  };

  try {
    const evaluator = new OpenAIEvaluator();
    const result = await evaluator.judgeCaseWithUsage(evaluatorInput);
    return {
      ok: true,
      caseId,
      label: result.label,
      rationale: result.rationale,
      durationMs: Date.now() - t0,
    };
  } catch (err) {
    return {
      ok: false,
      caseId,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - t0,
    };
  }
}

// ── 7. Reset all run state (development / experiment reset) ───
export async function actionResetRuns(): Promise<void> {
  RunStore.reset();
  WorkflowStore.reset();
  revalidatePath("/");
  revalidatePath("/evidence");
  revalidatePath("/diagnose");
  revalidatePath("/revalidation");
  revalidatePath("/history");
}

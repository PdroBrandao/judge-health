"use server";
// ============================================================
// Workflow Server Actions
//
// All mutations to WorkflowStore flow through here.
// Each action calls revalidatePath() so Next.js server
// components re-render with fresh data on the next request.
// ============================================================
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { WorkflowStore } from "@/data/workflow-store";
import { RunStore } from "@/data/run-store";
import { activeWorkspace } from "@/data/experiment-store";
import {
  decideExperimentCandidate,
  submitExperimentCandidateConfig,
  submitExperimentDiagnosis,
  submitExperimentIntervention,
} from "@/data/experiment-workflow";
import type {
  Label,
  DiagnosisCategory,
} from "@/core/types";

/** A configured workspace always writes to that experiment, never to Run #0001. */
function namedExperimentId(experimentId?: string): string | null {
  const workspace = activeWorkspace();
  if (workspace.mode !== "configured") return null;
  if (experimentId && experimentId !== workspace.experiment.id) {
    throw new Error("The named experiment is not the active workspace.");
  }
  return workspace.experiment.id;
}

function revalidateAll() {
  revalidatePath("/");
  revalidatePath("/intervention");
  revalidatePath("/revalidation");
  revalidatePath("/history");
}

// ── Submit Blind Human Review ─────────────────────────────────
export async function actionSubmitBlindReview(data: {
  caseId: string;
  reviewerAlias: string;
  label: Label;
  rationale: string;
}): Promise<{ ok: true }> {
  WorkflowStore.submitBlindReview({
    caseId: data.caseId,
    reviewerAlias: data.reviewerAlias,
    label: data.label,
    rationale: data.rationale,
    submittedAt: new Date().toISOString(),
  });
  revalidatePath(`/evidence/${data.caseId}`);
  return { ok: true };
}

// ── Submit Trigger-Level Diagnosis ────────────────────────────
export async function actionSubmitDiagnosis(data: {
  triggerId: string;
  evaluatorVersion: string;
  category: DiagnosisCategory;
  observationNote: string;
  revalidationRequested: boolean;
  experimentId?: string;
}): Promise<{ ok: true }> {
  const experimentId = namedExperimentId(data.experimentId);
  if (experimentId) {
    submitExperimentDiagnosis(experimentId, {
      triggerId: data.triggerId,
      evaluatorVersion: data.evaluatorVersion,
      category: data.category,
      observationNote: data.observationNote,
      revalidationRequested: data.revalidationRequested,
      createdAt: new Date().toISOString(),
    });
    revalidatePath("/diagnose");
    revalidatePath("/intervention");
    return { ok: true };
  }
  WorkflowStore.submitDiagnosis({
    triggerId: data.triggerId,
    evaluatorVersion: data.evaluatorVersion,
    category: data.category,
    observationNote: data.observationNote,
    revalidationRequested: data.revalidationRequested,
    createdAt: new Date().toISOString(),
  });
  revalidatePath("/diagnose");
  revalidatePath("/intervention");
  revalidatePath("/history");
  return { ok: true };
}

// ── Create Intervention ───────────────────────────────────────
// Appends a new intervention to the append-only array.
// Throws if there is already an active (non-submitted) intervention.
export async function actionCreateIntervention(data: {
  diagnosisId: string;
  baselineEvaluatorVersion: string;
  baselineRubricVersion: string;
  proposedRubricText: string;
  rationale: string;
  experimentId?: string;
}): Promise<{ ok: true }> {
  const experimentId = namedExperimentId(data.experimentId);
  if (experimentId) {
    submitExperimentIntervention(experimentId, {
      diagnosisId: data.diagnosisId,
      baselineEvaluatorVersion: data.baselineEvaluatorVersion,
      baselineRubricVersion: data.baselineRubricVersion,
      proposedRubricText: data.proposedRubricText,
      rationale: data.rationale,
      createdAt: new Date().toISOString(),
    });
    revalidatePath("/diagnose");
    revalidatePath("/intervention");
    return { ok: true };
  }
  WorkflowStore.createIntervention({
    diagnosisId: data.diagnosisId,
    baselineEvaluatorVersion: data.baselineEvaluatorVersion,
    baselineRubricVersion: data.baselineRubricVersion,
    proposedRubricText: data.proposedRubricText,
    rationale: data.rationale,
    createdAt: new Date().toISOString(),
  });
  revalidateAll();
  return { ok: true };
}

// ── Create Candidate ──────────────────────────────────────────
// Creates the candidate record from the current intervention.
// The version string includes a nonce to prevent same-day collision.
// Redirects to /revalidation after creation.
export async function actionCreateCandidate(data: {
  evaluatorVersion: string;
  rubricVersion: string;
  rubricText: string;
  taxonomyVersion: string;
  experimentId?: string;
}): Promise<never> {
  const experimentId = namedExperimentId(data.experimentId);
  if (experimentId) {
    submitExperimentCandidateConfig(experimentId, {
      rubricText: data.rubricText,
      rubricVersion: data.rubricVersion,
    });
    revalidatePath("/diagnose");
    revalidatePath("/intervention");
    revalidatePath("/revalidation");
    redirect("/revalidation");
  }
  // Idempotency guard: if a non-decided candidate is already active, redirect.
  const existing = WorkflowStore.getCurrentCandidate();
  if (existing && existing.status === "under_review") {
    redirect("/revalidation");
  }

  WorkflowStore.createCandidate({
    evaluatorVersion: data.evaluatorVersion,
    rubricVersion: data.rubricVersion,
    rubricText: data.rubricText,
    taxonomyVersion: data.taxonomyVersion,
  });
  revalidateAll();
  redirect("/revalidation");
}

// ── Record Revalidation Decision ──────────────────────────────
export async function actionRecordDecision(data: {
  candidateId: string;
  candidateVersion: string;
  baselineVersion: string;
  decision: "accepted" | "rejected";
  rationale: string;
  experimentId?: string;
}): Promise<{ ok: true }> {
  const experimentId = namedExperimentId(data.experimentId);
  if (experimentId) {
    decideExperimentCandidate(experimentId, {
      decision: data.decision,
      rationale: data.rationale,
      candidateVersion: data.candidateVersion,
      baselineVersion: data.baselineVersion,
    });
    revalidatePath("/");
    revalidatePath("/evidence");
    revalidatePath("/diagnose");
    revalidatePath("/intervention");
    revalidatePath("/revalidation");
    revalidatePath("/history");
    revalidatePath("/calibration-report");
    return { ok: true };
  }
  WorkflowStore.recordDecision({
    candidateId: data.candidateId,
    candidateVersion: data.candidateVersion,
    baselineVersion: data.baselineVersion,
    decision: data.decision,
    rationale: data.rationale,
    decidedAt: new Date().toISOString(),
  });
  revalidateAll();
  return { ok: true };
}

// ── Start New Attempt ─────────────────────────────────────────
// Clears the current-attempt pointers WITHOUT deleting any history.
// All previous interventions, candidates, runs, and decisions
// are preserved in their append-only arrays.
// The diagnosis remains; only the current-attempt pointers reset.
// Redirects to /intervention to begin the next attempt.
export async function actionStartNewAttempt(): Promise<void> {
  WorkflowStore.startNewAttempt();
  revalidateAll();
  redirect("/intervention");
}

// ── Reset Experiment (DESTRUCTIVE — development only) ─────────
// Wipes all in-memory and persisted experiment state.
// Deletes experiment-data/workflow-state.json and run-store.json.
// Must only be called from the Settings page via an explicit user action.
// NEVER auto-triggered on reload, recompile, or hot-reload.
export async function actionResetExperiment(): Promise<void> {
  WorkflowStore.reset();
  RunStore.reset();
  revalidatePath("/");
  revalidatePath("/evidence");
  revalidatePath("/diagnose");
  revalidatePath("/intervention");
  revalidatePath("/revalidation");
  revalidatePath("/history");
  revalidatePath("/calibration-report");
  redirect("/");
}

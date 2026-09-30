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
import type {
  Label,
  DiagnosisCategory,
} from "@/core/types";

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
  // Re-render the case detail page so existing review shows immediately
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
}): Promise<{ ok: true }> {
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
export async function actionCreateIntervention(data: {
  diagnosisId: string;
  baselineEvaluatorVersion: string;
  baselineRubricVersion: string;
  proposedRubricText: string;
  rationale: string;
}): Promise<{ ok: true }> {
  // WorkflowStore enforces that diagnosis exists
  WorkflowStore.createIntervention({
    diagnosisId: data.diagnosisId,
    baselineEvaluatorVersion: data.baselineEvaluatorVersion,
    baselineRubricVersion: data.baselineRubricVersion,
    proposedRubricText: data.proposedRubricText,
    rationale: data.rationale,
    createdAt: new Date().toISOString(),
  });
  revalidatePath("/intervention");
  revalidatePath("/revalidation");
  revalidatePath("/history");
  return { ok: true };
}

// ── Create Candidate ──────────────────────────────────────────
// Creates the dynamic candidate from the intervention.
// Redirects to revalidation after creation.
export async function actionCreateCandidate(data: {
  version: string;
  rubricVersion: string;
  taxonomyVersion: string;
  changeDescription: string;
}): Promise<never> {
  // WorkflowStore enforces that intervention exists
  WorkflowStore.createCandidate({
    version: data.version,
    status: "candidate",
    createdAt: new Date().toISOString(),
    rubricVersion: data.rubricVersion,
    taxonomyVersion: data.taxonomyVersion,
    changeDescription: data.changeDescription,
  });
  revalidatePath("/revalidation");
  revalidatePath("/history");
  redirect("/revalidation");
}

// ── Record Revalidation Decision ──────────────────────────────
export async function actionRecordDecision(data: {
  candidateVersion: string;
  baselineVersion: string;
  decision: "accepted" | "rejected";
  rationale: string;
}): Promise<{ ok: true }> {
  // WorkflowStore enforces that candidate exists
  WorkflowStore.recordDecision({
    candidateVersion: data.candidateVersion,
    baselineVersion: data.baselineVersion,
    decision: data.decision,
    rationale: data.rationale,
    decidedAt: new Date().toISOString(),
  });
  revalidatePath("/revalidation");
  revalidatePath("/history");
  revalidatePath("/");
  return { ok: true };
}

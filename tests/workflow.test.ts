// ============================================================
// Workflow Store — Invariant Tests (Milestone 3)
//
// Tests all state-machine invariants described in the spec:
//
//   INV-01  Blind review never overwrites fixture reference
//   INV-02  Multiple blind reviews for same case overwrites previous
//   INV-03  Intervention requires diagnosis (throws without it)
//   INV-04  Candidate requires intervention (throws without it)
//   INV-05  Accept transitions candidate to "active"
//   INV-06  Reject transitions candidate to "rejected"
//   INV-07  Accept marks baseline as superseded in store
//   INV-08  Reject does NOT mark baseline as superseded
//   INV-09  Only one active diagnosis at a time
//   INV-10  Diagnosis status transitions with intervention/resolution
//   INV-11  recordDecision throws if no candidate
//   INV-12  reset() clears all state (test isolation)
//
// All tests are deterministic and pure — no server actions called.
// ============================================================
import { describe, it, expect, beforeEach, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { WorkflowStore } from "../src/data/workflow-store";

// ── Test data helpers ─────────────────────────────────────────
const REVIEWER = "reviewer-A";

function blindReviewData(caseId = "case-001") {
  return {
    caseId,
    reviewerAlias: REVIEWER,
    label: "FAIL" as const,
    rationale: "Clearly a FAIL based on harm criterion.",
    submittedAt: new Date().toISOString(),
  };
}

function diagnosisData() {
  return {
    triggerId: "fail_recall_below_threshold",
    evaluatorVersion: "v0.2.0",
    category: "evaluator_rubric" as const,
    observationNote: "Rubric boundary unclear for edge cases.",
    revalidationRequested: true,
    createdAt: new Date().toISOString(),
  };
}

function candidateVersion() {
  return {
    evaluatorVersion: "v0.2.0-candidate.20261001",
    rubricVersion: "rubric-v0.2-proposed",
    rubricText: "Clarified FAIL boundary for ambiguous cases.",
    taxonomyVersion: "taxonomy-v0.1",
  };
}

// Reset store between every test for isolation
beforeEach(() => {
  WorkflowStore.reset();
});

// ─────────────────────────────────────────────────────────────
// INV-01: Blind review never touches fixture reference
// ─────────────────────────────────────────────────────────────
describe("INV-01: blind review does not overwrite fixture reference", () => {
  it("getBlindReview returns undefined when no review submitted", () => {
    expect(WorkflowStore.getBlindReview("case-001")).toBeUndefined();
  });

  it("submitBlindReview stores the review keyed by caseId", () => {
    const review = WorkflowStore.submitBlindReview(blindReviewData());
    expect(review.caseId).toBe("case-001");
    expect(review.label).toBe("FAIL");
    // The WorkflowStore has no write access to fixture files —
    // verify through the store API only (fixture is static import)
    const stored = WorkflowStore.getBlindReview("case-001");
    expect(stored).toBeDefined();
    expect(stored!.label).toBe("FAIL");
  });

  it("storing a review for case-002 does not affect case-001", () => {
    WorkflowStore.submitBlindReview(blindReviewData("case-001"));
    WorkflowStore.submitBlindReview({ ...blindReviewData("case-002"), label: "PASS" });
    expect(WorkflowStore.getBlindReview("case-001")!.label).toBe("FAIL");
    expect(WorkflowStore.getBlindReview("case-002")!.label).toBe("PASS");
  });
});

// ─────────────────────────────────────────────────────────────
// INV-02: Multiple submits for same case overwrites
// ─────────────────────────────────────────────────────────────
describe("INV-02: resubmitting a blind review overwrites previous", () => {
  it("second submission replaces first for same caseId", () => {
    WorkflowStore.submitBlindReview(blindReviewData("case-001")); // FAIL
    WorkflowStore.submitBlindReview({ ...blindReviewData("case-001"), label: "PASS" });
    expect(WorkflowStore.getBlindReview("case-001")!.label).toBe("PASS");
    // Only one entry per case
    expect(WorkflowStore.getAllBlindReviews().filter((r) => r.caseId === "case-001")).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────
// INV-03: Intervention requires diagnosis
// ─────────────────────────────────────────────────────────────
describe("INV-03: createIntervention requires an existing diagnosis", () => {
  it("throws when no diagnosis is recorded", () => {
    expect(() =>
      WorkflowStore.createIntervention({
        diagnosisId: "non-existent",
        baselineEvaluatorVersion: "v0.2.0",
        baselineRubricVersion: "rubric-v0.2",
        proposedRubricText: "Updated rubric text",
        rationale: "A valid rationale for the intervention.",
        createdAt: new Date().toISOString(),
      })
    ).toThrow(/cannot create intervention without an active diagnosis/i);
  });

  it("succeeds after a diagnosis is submitted", () => {
    const diag = WorkflowStore.submitDiagnosis(diagnosisData());
    const intervention = WorkflowStore.createIntervention({
      diagnosisId: diag.id,
      baselineEvaluatorVersion: "v0.2.0",
      baselineRubricVersion: "rubric-v0.2",
      proposedRubricText: "Updated rubric text with clarified FAIL boundary.",
      rationale: "Rubric ambiguity identified as root cause.",
      createdAt: new Date().toISOString(),
    });
    expect(intervention.diagnosisId).toBe(diag.id);
    expect(intervention.status).toBe("draft");
    expect(WorkflowStore.getCurrentIntervention()).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
// INV-04: Candidate requires intervention
// ─────────────────────────────────────────────────────────────
describe("INV-04: createCandidate requires an existing intervention", () => {
  it("throws when no intervention is recorded", () => {
    expect(() =>
      WorkflowStore.createCandidate(candidateVersion())
    ).toThrow(/cannot create candidate without an active intervention/i);
  });

  it("throws even if diagnosis exists but no intervention", () => {
    WorkflowStore.submitDiagnosis(diagnosisData());
    expect(() =>
      WorkflowStore.createCandidate(candidateVersion())
    ).toThrow(/cannot create candidate without an active intervention/i);
  });

  it("succeeds after a full diagnosis → intervention chain", () => {
    const diag = WorkflowStore.submitDiagnosis(diagnosisData());
    WorkflowStore.createIntervention({
      diagnosisId: diag.id,
      baselineEvaluatorVersion: "v0.2.0",
      baselineRubricVersion: "rubric-v0.2",
      proposedRubricText: "Updated rubric.",
      rationale: "Root cause: rubric ambiguity.",
      createdAt: new Date().toISOString(),
    });
    const candidate = WorkflowStore.createCandidate(candidateVersion());
    expect(candidate.evaluatorVersion).toBe("v0.2.0-candidate.20261001");
    expect(candidate.status).toBe("under_review");
    expect(WorkflowStore.getCurrentCandidate()).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
// INV-05 + INV-06: Accept/Reject transition candidate status
// ─────────────────────────────────────────────────────────────
describe("INV-05/06: accept/reject transitions candidate status", () => {
  function buildWorkflow() {
    const diag = WorkflowStore.submitDiagnosis(diagnosisData());
    WorkflowStore.createIntervention({
      diagnosisId: diag.id,
      baselineEvaluatorVersion: "v0.2.0",
      baselineRubricVersion: "rubric-v0.2",
      proposedRubricText: "Updated.",
      rationale: "Root cause found.",
      createdAt: new Date().toISOString(),
    });
    return WorkflowStore.createCandidate(candidateVersion());
  }

  it("accept transitions candidate to 'accepted'", () => {
    const cand = buildWorkflow();
    WorkflowStore.recordDecision({
      candidateId: cand.candidateId,
      candidateVersion: cand.evaluatorVersion,
      baselineVersion: "v0.2.0",
      decision: "accepted",
      rationale: "Metrics improved on primary safety indicator.",
      decidedAt: new Date().toISOString(),
    });
    expect(WorkflowStore.getCurrentCandidate()!.status).toBe("accepted");
  });

  it("reject transitions candidate to 'rejected'", () => {
    const cand = buildWorkflow();
    WorkflowStore.recordDecision({
      candidateId: cand.candidateId,
      candidateVersion: cand.evaluatorVersion,
      baselineVersion: "v0.2.0",
      decision: "rejected",
      rationale: "Metrics regressed on PASS recall — too many false alarms.",
      decidedAt: new Date().toISOString(),
    });
    expect(WorkflowStore.getCurrentCandidate()!.status).toBe("rejected");
  });
});

// ─────────────────────────────────────────────────────────────
// INV-07 + INV-08: Accept/Reject effects on baseline
// ─────────────────────────────────────────────────────────────
describe("INV-07/08: accept marks baseline superseded; reject does not", () => {
  function buildAndDecide(decision: "accepted" | "rejected") {
    const diag = WorkflowStore.submitDiagnosis(diagnosisData());
    WorkflowStore.createIntervention({
      diagnosisId: diag.id,
      baselineEvaluatorVersion: "v0.2.0",
      baselineRubricVersion: "rubric-v0.2",
      proposedRubricText: "Updated.",
      rationale: "Root cause found.",
      createdAt: new Date().toISOString(),
    });
    const cand = WorkflowStore.createCandidate(candidateVersion());
    WorkflowStore.recordDecision({
      candidateId: cand.candidateId,
      candidateVersion: cand.evaluatorVersion,
      baselineVersion: "v0.2.0",
      decision,
      rationale: "Decision rationale here.",
      decidedAt: new Date().toISOString(),
    });
  }

  it("accept: isBaselineSuperseded returns true for old baseline", () => {
    buildAndDecide("accepted");
    expect(WorkflowStore.isBaselineSuperseded("v0.2.0")).toBe(true);
  });

  it("reject: isBaselineSuperseded returns false", () => {
    buildAndDecide("rejected");
    expect(WorkflowStore.isBaselineSuperseded("v0.2.0")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// INV-09: Only one active diagnosis at a time
// ─────────────────────────────────────────────────────────────
describe("INV-09: only one diagnosis stored at a time", () => {
  it("second diagnosis replaces the first", () => {
    const d1 = WorkflowStore.submitDiagnosis(diagnosisData());
    const d2 = WorkflowStore.submitDiagnosis({
      ...diagnosisData(),
      observationNote: "Second diagnosis observation note.",
      category: "reference_process",
    });
    const stored = WorkflowStore.getDiagnosis();
    expect(stored!.id).toBe(d2.id);
    expect(stored!.id).not.toBe(d1.id);
  });
});

// ─────────────────────────────────────────────────────────────
// INV-10: Diagnosis status transitions
// ─────────────────────────────────────────────────────────────
describe("INV-10: diagnosis status transitions through workflow", () => {
  it("starts as 'open'", () => {
    WorkflowStore.submitDiagnosis(diagnosisData());
    expect(WorkflowStore.getDiagnosis()!.status).toBe("open");
  });

  it("transitions to 'intervention_created' when intervention is added", () => {
    const diag = WorkflowStore.submitDiagnosis(diagnosisData());
    WorkflowStore.createIntervention({
      diagnosisId: diag.id,
      baselineEvaluatorVersion: "v0.2.0",
      baselineRubricVersion: "rubric-v0.2",
      proposedRubricText: "Updated.",
      rationale: "Root cause found.",
      createdAt: new Date().toISOString(),
    });
    expect(WorkflowStore.getDiagnosis()!.status).toBe("intervention_created");
  });

  it("transitions to 'resolved' when decision is recorded", () => {
    const diag = WorkflowStore.submitDiagnosis(diagnosisData());
    WorkflowStore.createIntervention({
      diagnosisId: diag.id,
      baselineEvaluatorVersion: "v0.2.0",
      baselineRubricVersion: "rubric-v0.2",
      proposedRubricText: "Updated.",
      rationale: "Root cause found.",
      createdAt: new Date().toISOString(),
    });
    const cand = WorkflowStore.createCandidate(candidateVersion());
    WorkflowStore.recordDecision({
      candidateId: cand.candidateId,
      candidateVersion: cand.evaluatorVersion,
      baselineVersion: "v0.2.0",
      decision: "accepted",
      rationale: "Metrics improved on all key indicators.",
      decidedAt: new Date().toISOString(),
    });
    expect(WorkflowStore.getDiagnosis()!.status).toBe("resolved");
  });
});

// ─────────────────────────────────────────────────────────────
// INV-11: recordDecision requires candidate
// ─────────────────────────────────────────────────────────────
describe("INV-11: recordDecision requires an active candidate", () => {
  it("throws when no candidate exists", () => {
    expect(() =>
      WorkflowStore.recordDecision({
        candidateId: "nonexistent-cand-id",
        candidateVersion: "v0.2.0-candidate.20261001",
        baselineVersion: "v0.2.0",
        decision: "accepted",
        rationale: "Test rationale for invariant check.",
        decidedAt: new Date().toISOString(),
      })
    ).toThrow(/cannot record decision without an active candidate/i);
  });
});

// ─────────────────────────────────────────────────────────────
// INV-12: reset() provides clean slate for test isolation
// ─────────────────────────────────────────────────────────────
describe("INV-12: reset() clears all state", () => {
  it("returns to initial state after complex workflow", () => {
    const diag = WorkflowStore.submitDiagnosis(diagnosisData());
    WorkflowStore.submitBlindReview(blindReviewData());
    WorkflowStore.createIntervention({
      diagnosisId: diag.id,
      baselineEvaluatorVersion: "v0.2.0",
      baselineRubricVersion: "rubric-v0.2",
      proposedRubricText: "Updated.",
      rationale: "Root cause found.",
      createdAt: new Date().toISOString(),
    });
    WorkflowStore.createCandidate(candidateVersion());

    WorkflowStore.reset();

    expect(WorkflowStore.getDiagnosis()).toBeNull();
    expect(WorkflowStore.getCurrentIntervention()).toBeNull();
    expect(WorkflowStore.getCurrentCandidate()).toBeNull();
    expect(WorkflowStore.getCurrentDecision()).toBeNull();
    expect(WorkflowStore.getAllInterventions()).toHaveLength(0);
    expect(WorkflowStore.getAllCandidates()).toHaveLength(0);
    expect(WorkflowStore.getAllDecisions()).toHaveLength(0);
    expect(WorkflowStore.getAllBlindReviews()).toHaveLength(0);
    expect(WorkflowStore.getBlindReview("case-001")).toBeUndefined();
    expect(WorkflowStore.isBaselineSuperseded("v0.2.0")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// Additional: Intervention status transitions
// ─────────────────────────────────────────────────────────────
describe("Intervention status transitions", () => {
  it("starts as 'draft' when created", () => {
    const diag = WorkflowStore.submitDiagnosis(diagnosisData());
    WorkflowStore.createIntervention({
      diagnosisId: diag.id,
      baselineEvaluatorVersion: "v0.2.0",
      baselineRubricVersion: "rubric-v0.2",
      proposedRubricText: "Updated.",
      rationale: "Root cause found.",
      createdAt: new Date().toISOString(),
    });
    expect(WorkflowStore.getCurrentIntervention()!.status).toBe("draft");
  });

  it("transitions to 'candidate_created' when candidate is created", () => {
    const diag = WorkflowStore.submitDiagnosis(diagnosisData());
    WorkflowStore.createIntervention({
      diagnosisId: diag.id,
      baselineEvaluatorVersion: "v0.2.0",
      baselineRubricVersion: "rubric-v0.2",
      proposedRubricText: "Updated.",
      rationale: "Root cause found.",
      createdAt: new Date().toISOString(),
    });
    WorkflowStore.createCandidate(candidateVersion());
    expect(WorkflowStore.getCurrentIntervention()!.status).toBe("candidate_created");
  });
});

// ─────────────────────────────────────────────────────────────
// Additional: getAllBlindReviews
// ─────────────────────────────────────────────────────────────
describe("getAllBlindReviews", () => {
  it("returns all submitted reviews across different cases", () => {
    WorkflowStore.submitBlindReview(blindReviewData("case-001"));
    WorkflowStore.submitBlindReview({ ...blindReviewData("case-002"), label: "PASS" });
    WorkflowStore.submitBlindReview(blindReviewData("case-003"));
    const all = WorkflowStore.getAllBlindReviews();
    expect(all).toHaveLength(3);
    expect(all.map((r) => r.caseId).sort()).toEqual(["case-001", "case-002", "case-003"]);
  });
});

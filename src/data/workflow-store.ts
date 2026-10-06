// ============================================================
// WorkflowStore — multi-attempt, append-only workflow state
//
// Persistence: write-through JSON file via persistence.ts.
// On module init, hydrates from disk (experiment-data/workflow-state.json).
// Every mutation flushes to disk atomically before returning.
// Resets only on explicit actionResetExperiment() — never on hot-reload.
//
// Multi-attempt model:
//   ONE Diagnosis per workflow session.
//   N Interventions per Diagnosis (one per attempt).
//   N Candidates (one per intervention, 1:1).
//   N Decisions (one per candidate, 0..1).
//
// Every append-only collection is never overwritten:
//   interventions[], candidates[], decisions[]
//
// Current-attempt pointers (currentInterventionId, currentCandidateId)
// are nulled when starting a new attempt; they do NOT delete history.
//
// State machine per attempt:
//   INITIAL → Diagnosis → Intervention → Candidate
//           → Revalidation → Decision (accept/reject)
//   On REJECT: currentInterventionId=null, currentCandidateId=null
//              history preserved → new attempt starts
//   On ACCEPT: candidate promoted, workflow complete
// ============================================================
import type {
  BlindHumanReview,
  CandidateRecord,
  DiagnosisRecord,
  InterventionRecord,
  RevalidationDecision,
} from "@/core/types";
import {
  loadWorkflowState,
  saveWorkflowState,
  clearPersistedState,
} from "@/data/persistence";

// ── State shape ───────────────────────────────────────────────
interface WorkflowState {
  blindReviews: BlindHumanReview[];
  diagnosis: DiagnosisRecord | null;
  // Append-only attempt history (never cleared, only appended)
  interventions: InterventionRecord[];
  candidates: CandidateRecord[];
  decisions: RevalidationDecision[];
  // Current-attempt pointers (null = no active attempt / ready for new)
  currentInterventionId: string | null;
  currentCandidateId: string | null;
  // Baseline run (set once when live baseline completes)
  baselineRunId: string | null;
  // Version string of the superseded baseline (when a candidate is accepted)
  supersededVersion: string | null;
}

// ── Initial state shape ───────────────────────────────────────
const INITIAL_STATE: WorkflowState = {
  blindReviews: [],
  diagnosis: null,
  interventions: [],
  candidates: [],
  decisions: [],
  currentInterventionId: null,
  currentCandidateId: null,
  baselineRunId: null,
  supersededVersion: null,
};

// ── Module-level singleton — hydrate from disk on startup ─────
// loadWorkflowState() returns null in test env or if no file exists,
// in which case we start from INITIAL_STATE.
let _state: WorkflowState = (loadWorkflowState() as WorkflowState | null) ?? { ...INITIAL_STATE };

// ── ID generators ─────────────────────────────────────────────
function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function candidateUid(): string {
  return `cand-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// ── Store API ─────────────────────────────────────────────────
export const WorkflowStore = {

  // ── Read ──────────────────────────────────────────────────

  getState(): Readonly<WorkflowState> {
    return _state;
  },

  getBlindReview(caseId: string): BlindHumanReview | undefined {
    return _state.blindReviews.find((r) => r.caseId === caseId);
  },

  getAllBlindReviews(): BlindHumanReview[] {
    return [..._state.blindReviews];
  },

  getDiagnosis(): DiagnosisRecord | null {
    return _state.diagnosis;
  },

  // ── Intervention reads ────────────────────────────────────

  /** All interventions across all attempts, in insertion order. */
  getAllInterventions(): InterventionRecord[] {
    return [..._state.interventions];
  },

  /** The intervention for the current attempt, or null if none active. */
  getCurrentIntervention(): InterventionRecord | null {
    if (!_state.currentInterventionId) return null;
    return _state.interventions.find((i) => i.id === _state.currentInterventionId) ?? null;
  },

  // ── Candidate reads ───────────────────────────────────────

  /** All candidates across all attempts, in insertion order. */
  getAllCandidates(): CandidateRecord[] {
    return [..._state.candidates];
  },

  /** The candidate for the current attempt, or null if none active. */
  getCurrentCandidate(): CandidateRecord | null {
    if (!_state.currentCandidateId) return null;
    return _state.candidates.find((c) => c.candidateId === _state.currentCandidateId) ?? null;
  },

  // ── Decision reads ────────────────────────────────────────

  /** All decisions across all attempts, in insertion order. */
  getAllDecisions(): RevalidationDecision[] {
    return [..._state.decisions];
  },

  /**
   * The decision for the current candidate, or null if none recorded.
   * Looks up by currentCandidateId.
   */
  getCurrentDecision(): RevalidationDecision | null {
    if (!_state.currentCandidateId) return null;
    return (
      _state.decisions.find((d) => d.candidateId === _state.currentCandidateId) ?? null
    );
  },

  // ── Run ID reads ──────────────────────────────────────────

  getBaselineRunId(): string | null {
    return _state.baselineRunId;
  },

  /** Run ID for the current candidate's revalidation run, or null. */
  getCurrentCandidateRunId(): string | null {
    return _state.candidates.find(
      (c) => c.candidateId === _state.currentCandidateId
    )?.revalidationRunId ?? null;
  },

  /** True if the baseline was superseded by an accepted candidate. */
  isBaselineSuperseded(version: string): boolean {
    return _state.supersededVersion === version;
  },

  // ── Baseline run ──────────────────────────────────────────

  setBaselineRunId(runId: string): void {
    _state = { ..._state, baselineRunId: runId };
    saveWorkflowState(_state);
  },

  // ── Mutate ────────────────────────────────────────────────

  /**
   * Submit a blind human review for a single case.
   * Multiple submissions for the same case overwrite previous.
   */
  submitBlindReview(data: Omit<BlindHumanReview, "id">): BlindHumanReview {
    const review: BlindHumanReview = { id: uid(), ...data };
    _state = {
      ..._state,
      blindReviews: [
        ..._state.blindReviews.filter((r) => r.caseId !== data.caseId),
        review,
      ],
    };
    saveWorkflowState(_state);
    return review;
  },

  /**
   * Record the trigger-level diagnosis.
   * Only one diagnosis per session. Replaces previous if re-submitted.
   */
  submitDiagnosis(data: Omit<DiagnosisRecord, "id" | "status">): DiagnosisRecord {
    const record: DiagnosisRecord = { id: uid(), ...data, status: "open" };
    _state = { ..._state, diagnosis: record };
    saveWorkflowState(_state);
    return record;
  },

  /**
   * Create a new intervention for the current attempt.
   * Appends to interventions[] — never overwrites.
   * Requires an existing diagnosis and no currently-active intervention.
   */
  createIntervention(
    data: Omit<InterventionRecord, "id" | "status" | "attemptNumber">
  ): InterventionRecord {
    if (!_state.diagnosis) {
      throw new Error("WorkflowStore: cannot create intervention without an active diagnosis.");
    }
    if (_state.currentInterventionId) {
      throw new Error(
        "WorkflowStore: an intervention is already active. " +
        "Call startNewAttempt() before creating another."
      );
    }
    const attemptNumber = _state.interventions.length + 1;
    const record: InterventionRecord = {
      id: uid(),
      ...data,
      attemptNumber,
      status: "draft",
    };
    _state = {
      ..._state,
      interventions: [..._state.interventions, record],
      currentInterventionId: record.id,
      diagnosis: _state.diagnosis
        ? { ..._state.diagnosis, status: "intervention_created" }
        : null,
    };
    saveWorkflowState(_state);
    return record;
  },

  /**
   * Create a candidate from the current intervention.
   * Appends to candidates[] — never overwrites.
   * Requires an existing current intervention.
   */
  createCandidate(
    data: Omit<CandidateRecord, "candidateId" | "interventionId" | "attemptNumber" | "status" | "createdAt" | "revalidationRunId" | "decisionId">
  ): CandidateRecord {
    const intervention = _state.interventions.find(
      (i) => i.id === _state.currentInterventionId
    );
    if (!intervention) {
      throw new Error("WorkflowStore: cannot create candidate without an active intervention.");
    }
    if (_state.currentCandidateId) {
      throw new Error(
        "WorkflowStore: a candidate is already active. " +
        "Call startNewAttempt() before creating another."
      );
    }
    const candidate: CandidateRecord = {
      ...data,
      candidateId: candidateUid(),
      interventionId: intervention.id,
      attemptNumber: intervention.attemptNumber,
      status: "under_review",
      createdAt: new Date().toISOString(),
      revalidationRunId: null,
      decisionId: null,
    };
    _state = {
      ..._state,
      candidates: [..._state.candidates, candidate],
      currentCandidateId: candidate.candidateId,
      interventions: _state.interventions.map((i) =>
        i.id === intervention.id ? { ...i, status: "candidate_created" as const } : i
      ),
    };
    saveWorkflowState(_state);
    return candidate;
  },

  /**
   * Set the revalidation run ID on the current candidate.
   * Called when a live candidate run is created in RunStore.
   */
  setCurrentCandidateRunId(runId: string): void {
    if (!_state.currentCandidateId) {
      throw new Error("WorkflowStore: no active candidate to attach run to.");
    }
    _state = {
      ..._state,
      candidates: _state.candidates.map((c) =>
        c.candidateId === _state.currentCandidateId
          ? { ...c, revalidationRunId: runId }
          : c
      ),
    };
    saveWorkflowState(_state);
  },

  /**
   * Record the accept/reject decision for the current candidate.
   * Appends to decisions[] — never overwrites.
   * ACCEPT: candidate status → "accepted"; baseline superseded.
   * REJECT: candidate status → "rejected"; baseline stays active.
   */
  recordDecision(data: Omit<RevalidationDecision, "id">): RevalidationDecision {
    if (!_state.currentCandidateId) {
      throw new Error("WorkflowStore: cannot record decision without an active candidate.");
    }
    const decision: RevalidationDecision = { id: uid(), ...data };
    const accepted = data.decision === "accepted";

    _state = {
      ..._state,
      decisions: [..._state.decisions, decision],
      candidates: _state.candidates.map((c) =>
        c.candidateId === _state.currentCandidateId
          ? { ...c, status: accepted ? "accepted" : "rejected", decisionId: decision.id }
          : c
      ),
      supersededVersion: accepted ? data.baselineVersion : _state.supersededVersion,
      diagnosis: _state.diagnosis
        ? { ..._state.diagnosis, status: "resolved" }
        : null,
    };
    saveWorkflowState(_state);
    return decision;
  },

  /**
   * Start a new attempt after rejection.
   * Clears the current-attempt pointers WITHOUT deleting any history.
   * interventions[], candidates[], decisions[] are preserved.
   * Diagnosis status is reopened so a new intervention can be created.
   *
   * Precondition: must only be called after a "rejected" decision.
   */
  startNewAttempt(): void {
    _state = {
      ..._state,
      currentInterventionId: null,
      currentCandidateId: null,
      diagnosis: _state.diagnosis
        ? { ..._state.diagnosis, status: "open" as const }
        : null,
    };
    saveWorkflowState(_state);
  },

  // ── Test utility ──────────────────────────────────────────

  /** Reset to initial state. Tests and explicit Reset Experiment action only. */
  reset(): void {
    _state = { ...INITIAL_STATE };
    clearPersistedState();
  },
} as const;

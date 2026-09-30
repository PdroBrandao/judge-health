// ============================================================
// WorkflowStore — in-memory state for the Judge Health workflow
//
// Persistence: module-level singleton. Survives page navigations
// and browser refreshes (same Node.js process). Resets on server
// restart (npm run dev). This is intentional for local demo use.
//
// Thin abstraction: the WorkflowStore interface can be dropped
// behind a real repository (database) later without changing callers.
//
// State machine:
//   INITIAL → Diagnosis → Intervention → Candidate
//           → Revalidation → Decision (accept/reject)
//
// Invariants enforced here:
//   - createIntervention() requires an existing diagnosis
//   - createCandidate() requires an existing intervention
//   - submitBlindReview() never touches HumanReferenceRecord fixtures
//   - recordDecision("accepted") promotes candidate to ACTIVE
//     and marks baseline as SUPERSEDED in store (fixture unchanged)
//   - recordDecision("rejected") marks candidate as REJECTED;
//     baseline version remains ACTIVE
// ============================================================
import type {
  BlindHumanReview,
  DiagnosisRecord,
  InterventionRecord,
  RevalidationDecision,
  EvaluatorVersion,
} from "@/core/types";

// ── State shape ───────────────────────────────────────────────
interface WorkflowState {
  blindReviews: BlindHumanReview[];
  diagnosis: DiagnosisRecord | null;
  intervention: InterventionRecord | null;
  // Dynamically created by the intervention step
  candidateVersion: EvaluatorVersion | null;
  // Track if the active version was superseded in this workflow run
  supersededVersion: string | null;
  revalidationDecision: RevalidationDecision | null;
}

// ── Module-level singleton ────────────────────────────────────
let _state: WorkflowState = {
  blindReviews: [],
  diagnosis: null,
  intervention: null,
  candidateVersion: null,
  supersededVersion: null,
  revalidationDecision: null,
};

// ── ID generator ──────────────────────────────────────────────
function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
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

  getIntervention(): InterventionRecord | null {
    return _state.intervention;
  },

  getCandidateVersion(): EvaluatorVersion | null {
    return _state.candidateVersion;
  },

  getRevalidationDecision(): RevalidationDecision | null {
    return _state.revalidationDecision;
  },

  /** True if the baseline was superseded by an accepted candidate in this run */
  isBaselineSuperseded(version: string): boolean {
    return _state.supersededVersion === version;
  },

  // ── Mutate ────────────────────────────────────────────────

  /**
   * Submit a blind human review for a single case.
   * DOES NOT modify HumanReferenceRecord fixture — these are
   * always stored and displayed as separate records.
   * Multiple submissions for the same case are allowed (overwrites).
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
    return review;
  },

  /**
   * Record the trigger-level diagnosis.
   * Only one active diagnosis at a time (replaces previous).
   * status starts as "open".
   */
  submitDiagnosis(data: Omit<DiagnosisRecord, "id" | "status">): DiagnosisRecord {
    const record: DiagnosisRecord = {
      id: uid(),
      ...data,
      status: "open",
    };
    _state = { ..._state, diagnosis: record };
    return record;
  },

  /**
   * Create an intervention from an existing diagnosis.
   * Throws if no diagnosis exists — invariant enforced here.
   */
  createIntervention(data: Omit<InterventionRecord, "id" | "status">): InterventionRecord {
    if (!_state.diagnosis) {
      throw new Error(
        "WorkflowStore: cannot create intervention without an active diagnosis."
      );
    }
    const record: InterventionRecord = {
      id: uid(),
      ...data,
      status: "draft",
    };
    _state = {
      ..._state,
      intervention: record,
      diagnosis: _state.diagnosis
        ? { ..._state.diagnosis, status: "intervention_created" }
        : null,
    };
    return record;
  },

  /**
   * Create a candidate evaluator version from an intervention.
   * Throws if no intervention exists — invariant enforced here.
   * The intervention status transitions to "candidate_created".
   */
  createCandidate(version: EvaluatorVersion): EvaluatorVersion {
    if (!_state.intervention) {
      throw new Error(
        "WorkflowStore: cannot create candidate without an active intervention."
      );
    }
    _state = {
      ..._state,
      candidateVersion: version,
      intervention: { ..._state.intervention, status: "candidate_created" },
    };
    return version;
  },

  /**
   * Record the accept/reject decision for the current candidate.
   * ACCEPT: candidate becomes ACTIVE; previous active becomes SUPERSEDED.
   * REJECT: candidate becomes REJECTED; baseline stays ACTIVE.
   * Fixture evaluator-versions.ts is NEVER mutated — changes are in-store.
   */
  recordDecision(data: Omit<RevalidationDecision, "id">): RevalidationDecision {
    if (!_state.candidateVersion) {
      throw new Error(
        "WorkflowStore: cannot record decision without an active candidate."
      );
    }
    const decision: RevalidationDecision = { id: uid(), ...data };

    const newCandidateStatus =
      data.decision === "accepted" ? "active" : "rejected";

    _state = {
      ..._state,
      candidateVersion: {
        ..._state.candidateVersion,
        status: newCandidateStatus,
      },
      supersededVersion:
        data.decision === "accepted" ? data.baselineVersion : _state.supersededVersion,
      revalidationDecision: decision,
      diagnosis: _state.diagnosis
        ? { ..._state.diagnosis, status: "resolved" }
        : null,
    };
    return decision;
  },

  // ── Test utility ──────────────────────────────────────────

  /**
   * Reset to initial state. Used in tests only.
   * Must be called between test cases to ensure isolation.
   */
  reset(): void {
    _state = {
      blindReviews: [],
      diagnosis: null,
      intervention: null,
      candidateVersion: null,
      supersededVersion: null,
      revalidationDecision: null,
    };
  },
} as const;

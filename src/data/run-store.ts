// ============================================================
// RunStore — immutable EvaluationRun persistence
//
// Module-level singleton, separate from WorkflowStore.
//
// Immutability rules:
//   - A run in "completed" status is sealed: no further mutations.
//   - addJudgment / addError / setStatus throw if run is completed.
//   - A new run never overwrites a previous one (append-only).
//
// Durability: write-through JSON file via persistence.ts.
// On module init, hydrates from experiment-data/run-store.json.
// Every mutation flushes atomically to disk before returning.
// The last completed baseline/candidate run is the authoritative
// source for revalidation metrics.
// ============================================================
import type {
  EvaluationRun,
  EvaluationRunStatus,
  LiveJudgment,
  RunError,
} from "@/core/types";
import { loadRuns, saveRuns, clearPersistedState } from "@/data/persistence";

// ── Module-level singleton — hydrate from disk on startup ─────
let _runs: EvaluationRun[] = loadRuns() ?? [];

// ── ID generator ──────────────────────────────────────────────
function uid(): string {
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// ── Store API ─────────────────────────────────────────────────
export const RunStore = {

  // ── Read ──────────────────────────────────────────────────

  /** All runs in insertion order. */
  getAllRuns(): EvaluationRun[] {
    return [..._runs];
  },

  getRun(runId: string): EvaluationRun | undefined {
    return _runs.find((r) => r.runId === runId);
  },

  /**
   * Most recent completed baseline run.
   * If a live baseline exists: prefer it over fixture.
   * Within same mode: most recently completed.
   */
  getBaselineRun(): EvaluationRun | undefined {
    const completed = _runs.filter(
      (r) => r.type === "baseline" && (r.status === "completed" || r.status === "partial_failure")
    );
    // Prefer live over fixture; within mode prefer most recent
    const live = completed.filter((r) => r.mode === "live");
    if (live.length > 0) return live[live.length - 1];
    const fixture = completed.filter((r) => r.mode === "fixture");
    if (fixture.length > 0) return fixture[fixture.length - 1];
    return undefined;
  },

  /**
   * Most recent completed candidate run.
   */
  getCandidateRun(): EvaluationRun | undefined {
    const completed = _runs.filter(
      (r) => r.type === "candidate" && (r.status === "completed" || r.status === "partial_failure")
    );
    const live = completed.filter((r) => r.mode === "live");
    if (live.length > 0) return live[live.length - 1];
    const fixture = completed.filter((r) => r.mode === "fixture");
    if (fixture.length > 0) return fixture[fixture.length - 1];
    return undefined;
  },

  /** Active (running/pending) run of a given type, if any. */
  getActiveRun(type: "baseline" | "candidate"): EvaluationRun | undefined {
    return _runs.find(
      (r) => r.type === type && (r.status === "pending" || r.status === "running")
    );
  },

  // ── Mutate ────────────────────────────────────────────────

  /** Create a new run. Returns the run record with generated runId. */
  createRun(params: Omit<EvaluationRun, "runId" | "startedAt" | "completedAt" | "status" | "judgments" | "errors" | "usage">): EvaluationRun {
    const run: EvaluationRun = {
      ...params,
      runId: uid(),
      startedAt: new Date().toISOString(),
      completedAt: null,
      status: "pending",
      judgments: [],
      errors: [],
      usage: { totalTokens: 0, promptTokens: 0, completionTokens: 0 },
    };
    _runs = [..._runs, run];
    saveRuns(_runs);
    return run;
  },

  /** Transition status to "running". Call after createRun to mark start. */
  startRun(runId: string): void {
    _runs = _runs.map((r) =>
      r.runId === runId ? { ...r, status: "running" as const } : r
    );
    saveRuns(_runs);
  },

  /** Append a successful judgment to a run. Throws if run is sealed. */
  addJudgment(runId: string, judgment: LiveJudgment): void {
    const run = _runs.find((r) => r.runId === runId);
    if (!run) throw new Error(`RunStore: run ${runId} not found.`);
    if (run.status === "completed") {
      throw new Error(`RunStore: run ${runId} is sealed (completed). Cannot add judgment.`);
    }
    _runs = _runs.map((r) => {
      if (r.runId !== runId) return r;
      return {
        ...r,
        judgments: [...r.judgments, judgment],
        usage: {
          totalTokens:      r.usage.totalTokens      + (judgment.usageTokens ?? 0),
          promptTokens:     r.usage.promptTokens,
          completionTokens: r.usage.completionTokens,
        },
      };
    });
    saveRuns(_runs);
  },

  /** Append a failed case error to a run. Throws if run is sealed. */
  addError(runId: string, error: RunError): void {
    const run = _runs.find((r) => r.runId === runId);
    if (!run) throw new Error(`RunStore: run ${runId} not found.`);
    if (run.status === "completed") {
      throw new Error(`RunStore: run ${runId} is sealed. Cannot add error.`);
    }
    _runs = _runs.map((r) =>
      r.runId !== runId ? r : { ...r, errors: [...r.errors, error] }
    );
    saveRuns(_runs);
  },

  /** Replace an error with a successful judgment (retry). Throws if run is sealed. */
  resolveError(runId: string, caseId: string, judgment: LiveJudgment): void {
    const run = _runs.find((r) => r.runId === runId);
    if (!run) throw new Error(`RunStore: run ${runId} not found.`);
    if (run.status === "completed") {
      throw new Error(`RunStore: run ${runId} is sealed (completed). Cannot resolve error.`);
    }
    _runs = _runs.map((r) => {
      if (r.runId !== runId) return r;
      return {
        ...r,
        errors: r.errors.filter((e) => e.caseId !== caseId),
        judgments: [
          ...r.judgments.filter((j) => j.caseId !== caseId),
          judgment,
        ],
        usage: {
          ...r.usage,
          totalTokens: r.usage.totalTokens + (judgment.usageTokens ?? 0),
        },
      };
    });
    saveRuns(_runs);
  },

  /**
   * Mark a run as completed. Seals the run — no further mutations.
   * Sets status to "completed" if no errors, "partial_failure" if some cases failed.
   */
  completeRun(runId: string): EvaluationRun {
    const run = _runs.find((r) => r.runId === runId);
    if (!run) throw new Error(`RunStore: run ${runId} not found.`);
    // Idempotent: if already sealed, return the existing run without re-mutating.
    if (run.status === "completed" || run.status === "partial_failure") return run;
    const finalStatus: EvaluationRunStatus =
      run.errors.length === 0 ? "completed" : "partial_failure";
    const completed: EvaluationRun = {
      ...run,
      status: finalStatus,
      completedAt: new Date().toISOString(),
    };
    _runs = _runs.map((r) => (r.runId === runId ? completed : r));
    saveRuns(_runs);
    return completed;
  },

  /** Fail a run entirely. */
  failRun(runId: string, reason: string): void {
    _runs = _runs.map((r) => {
      if (r.runId !== runId) return r;
      return {
        ...r,
        status: "failed" as const,
        completedAt: new Date().toISOString(),
        errors: [
          ...r.errors,
          { caseId: "run", error: reason, timestamp: new Date().toISOString() },
        ],
      };
    });
    saveRuns(_runs);
  },

  // ── Test utility ──────────────────────────────────────────

  /** Reset all runs. Test isolation and explicit Reset Experiment action only. */
  reset(): void {
    _runs = [];
    clearPersistedState();
  },
} as const;

// ── Convert LiveJudgment[] to Judgment[] for metrics engine ──
// The metrics engine takes `Judgment[]` (from core/types).
// LiveJudgment is a superset; this adapter function extracts
// the fields needed without losing the live metadata.
import type { Judgment } from "@/core/types";

export function liveJudgmentsToJudgments(live: LiveJudgment[]): Judgment[] {
  return live.map((j) => ({
    caseId: j.caseId,
    evaluatorVersion: j.evaluatorVersion,
    predictedLabel: j.label,
  }));
}

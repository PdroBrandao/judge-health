// ============================================================
// evidence-selector.test.ts — EVID-01 through EVID-05
//
// Tests for the pure exported functions in evidence/page.tsx:
//   buildRunOptions()
//   resolveDefaultRunId()
//
// Dependencies are injected. No server-only imports touched.
// Tests NEVER spend API credits (no OpenAI calls).
// ============================================================
import { describe, it, expect, vi } from "vitest";

// Required: evidence/page.tsx → WorkflowStore/RunStore → persistence.ts → "server-only"
vi.mock("server-only", () => ({}));

// Mock Next.js and local UI imports that are not needed for pure-function tests
vi.mock("next/link", () => ({ default: () => null }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/evidence",
}));
vi.mock("@/components/EvidenceRunSelector", () => ({ EvidenceRunSelector: () => null }));
vi.mock("@/components/instrument/InstrumentPanel", () => ({ InstrumentPanel: () => null }));
vi.mock("@/components/instrument/StatusLED", () => ({ StatusLED: () => null }));
vi.mock("@/data/fixture-repository", () => ({
  FixtureRepository: { getEvidenceSummaries: () => [] },
}));
vi.mock("@/data/workflow-store", () => ({
  WorkflowStore: {
    getAllCandidates: () => [],
    getBaselineRunId: () => null,
  },
}));
vi.mock("@/data/run-store", () => ({
  RunStore: { getRun: () => undefined, getBaselineRun: () => undefined },
  liveJudgmentsToJudgments: () => [],
}));
import {
  buildRunOptions,
  resolveDefaultRunId,
} from "@/app/evidence/page";
import type { CandidateRecord, EvaluationRun } from "@/core/types";

// ── Helpers ───────────────────────────────────────────────────
function makeRun(
  overrides: Partial<EvaluationRun> & { runId: string },
): EvaluationRun {
  return {
    type:             "baseline",
    mode:             "live",
    evaluatorVersion: "v0.2.0",
    rubricVersion:    "rub-001",
    taxonomyVersion:  "tax-001",
    model:            "gpt-4o",
    sampleIds:        ["c-001", "c-002", "c-003"],
    startedAt:        "2026-10-01T10:00:00Z",
    completedAt:      "2026-10-01T10:05:00Z",
    status:           "completed",
    judgments:        [],
    errors:           [],
    usage:            { totalTokens: 1000, promptTokens: 800, completionTokens: 200 },
    ...overrides,
  };
}

function makeCandidate(
  overrides: Partial<CandidateRecord> & { candidateId: string },
): CandidateRecord {
  return {
    interventionId:    "int-001",
    attemptNumber:     1,
    evaluatorVersion:  "v0.2.0-candidate.20261001-ab3f",
    rubricVersion:     "rub-002",
    rubricText:        "Rubric text",
    taxonomyVersion:   "tax-001",
    status:            "under_review",
    createdAt:         "2026-10-01T09:00:00Z",
    revalidationRunId: null,
    decisionId:        null,
    ...overrides,
  };
}

// ── EVID-01 ── buildRunOptions — baseline only ────────────────
describe("EVID-01: buildRunOptions — baseline only", () => {
  it("returns one option for the baseline run, no candidates", () => {
    const baselineRun = makeRun({ runId: "run-baseline-001" });
    const getRun = (id: string) => id === "run-baseline-001" ? baselineRun : undefined;

    const opts = buildRunOptions([], "run-baseline-001", getRun);

    expect(opts).toHaveLength(1);
    expect(opts[0].runId).toBe("run-baseline-001");
    expect(opts[0].label).toBe("Live Baseline");
    expect(opts[0].attemptNumber).toBeNull();
    expect(opts[0].isCurrent).toBe(false);
    expect(opts[0].judgedCount).toBe(0);
    expect(opts[0].totalCount).toBe(3);
    expect(opts[0].model).toBe("gpt-4o");
  });

  it("returns empty array when baseline run ID exists but run is not in store", () => {
    const opts = buildRunOptions([], "run-missing-999", () => undefined);
    expect(opts).toHaveLength(0);
  });

  it("returns empty array when no baseline and no candidates", () => {
    const opts = buildRunOptions([], null, () => undefined);
    expect(opts).toHaveLength(0);
  });
});

// ── EVID-02 ── buildRunOptions — candidate runs included ──────
describe("EVID-02: buildRunOptions — with candidates", () => {
  it("includes candidate runs in chronological order after baseline", () => {
    const baselineRun = makeRun({ runId: "run-bl-001" });
    const candRun1    = makeRun({ runId: "run-cand-001", type: "candidate" });
    const candRun2    = makeRun({ runId: "run-cand-002", type: "candidate" });

    const candidates: CandidateRecord[] = [
      makeCandidate({
        candidateId: "cand-1",
        attemptNumber: 1,
        revalidationRunId: "run-cand-001",
        status: "accepted",
        evaluatorVersion: "v0.2.0-candidate.001",
      }),
      makeCandidate({
        candidateId: "cand-2",
        attemptNumber: 2,
        revalidationRunId: "run-cand-002",
        status: "under_review",
        evaluatorVersion: "v0.2.0-candidate.002",
      }),
    ];

    const runMap: Record<string, EvaluationRun> = {
      "run-bl-001":   baselineRun,
      "run-cand-001": candRun1,
      "run-cand-002": candRun2,
    };
    const getRun = (id: string) => runMap[id];

    const opts = buildRunOptions(candidates, "run-bl-001", getRun);

    expect(opts).toHaveLength(3);
    expect(opts[0].label).toBe("Live Baseline");
    expect(opts[1].label).toBe("Candidate Attempt #1");
    expect(opts[1].isCurrent).toBe(false);  // accepted, not under_review
    expect(opts[2].label).toBe("Candidate Attempt #2");
    expect(opts[2].isCurrent).toBe(true);   // current under_review candidate
    expect(opts[2].evaluatorVersion).toBe("v0.2.0-candidate.002");
  });

  it("skips candidate records that have no revalidationRunId", () => {
    const candidates: CandidateRecord[] = [
      makeCandidate({ candidateId: "cand-no-run", revalidationRunId: null, status: "under_review" }),
    ];
    const opts = buildRunOptions(candidates, null, () => undefined);
    expect(opts).toHaveLength(0);
  });

  it("skips candidate records whose run is not in the store", () => {
    const candidates: CandidateRecord[] = [
      makeCandidate({
        candidateId: "cand-missing",
        revalidationRunId: "run-not-in-store",
        status: "under_review",
      }),
    ];
    const opts = buildRunOptions(candidates, null, () => undefined);
    expect(opts).toHaveLength(0);
  });
});

// ── EVID-03 ── resolveDefaultRunId — baseline default ─────────
describe("EVID-03: resolveDefaultRunId — baseline selection", () => {
  it("returns baselineRunId when no candidates are under review", () => {
    const baselineRun = makeRun({ runId: "run-bl-001" });
    const getRun = (id: string) => id === "run-bl-001" ? baselineRun : undefined;

    const result = resolveDefaultRunId([], "run-bl-001", getRun);
    expect(result).toBe("run-bl-001");
  });

  it("returns null when baseline run is fixture mode (not live)", () => {
    const baselineRun = makeRun({ runId: "run-bl-fixture", mode: "fixture" });
    const getRun = (id: string) => id === "run-bl-fixture" ? baselineRun : undefined;

    const result = resolveDefaultRunId([], "run-bl-fixture", getRun);
    expect(result).toBeNull();
  });

  it("returns null when baseline run is running (not completed)", () => {
    const baselineRun = makeRun({ runId: "run-bl-001", status: "running", completedAt: null });
    const getRun = (id: string) => id === "run-bl-001" ? baselineRun : undefined;

    const result = resolveDefaultRunId([], "run-bl-001", getRun);
    expect(result).toBeNull();
  });

  it("accepts partial_failure baseline as a valid default", () => {
    const baselineRun = makeRun({ runId: "run-bl-001", status: "partial_failure" });
    const getRun = (id: string) => id === "run-bl-001" ? baselineRun : undefined;

    const result = resolveDefaultRunId([], "run-bl-001", getRun);
    expect(result).toBe("run-bl-001");
  });

  it("returns null when no baseline and no candidates", () => {
    const result = resolveDefaultRunId([], null, () => undefined);
    expect(result).toBeNull();
  });
});

// ── EVID-04 ── resolveDefaultRunId — candidate-first priority ─
describe("EVID-04: resolveDefaultRunId — current candidate takes priority", () => {
  it("returns candidate run when it is under_review and completed", () => {
    const baselineRun = makeRun({ runId: "run-bl-001" });
    const candRun     = makeRun({ runId: "run-cand-001", type: "candidate" });

    const candidates: CandidateRecord[] = [
      makeCandidate({
        candidateId:       "cand-1",
        revalidationRunId: "run-cand-001",
        status:            "under_review",
      }),
    ];

    const runMap: Record<string, EvaluationRun> = {
      "run-bl-001":   baselineRun,
      "run-cand-001": candRun,
    };
    const getRun = (id: string) => runMap[id];

    const result = resolveDefaultRunId(candidates, "run-bl-001", getRun);
    // Candidate under_review takes priority over baseline
    expect(result).toBe("run-cand-001");
  });

  it("falls back to baseline when under_review candidate run is still running (not sealed)", () => {
    const baselineRun = makeRun({ runId: "run-bl-001" });
    const candRun     = makeRun({
      runId: "run-cand-001",
      type: "candidate",
      status: "running",
      completedAt: null,
    });

    const candidates: CandidateRecord[] = [
      makeCandidate({
        candidateId:       "cand-1",
        revalidationRunId: "run-cand-001",
        status:            "under_review",
      }),
    ];

    const runMap: Record<string, EvaluationRun> = {
      "run-bl-001":   baselineRun,
      "run-cand-001": candRun,
    };
    const getRun = (id: string) => runMap[id];

    const result = resolveDefaultRunId(candidates, "run-bl-001", getRun);
    // Candidate not sealed yet → falls back to baseline
    expect(result).toBe("run-bl-001");
  });

  it("ignores accepted/rejected candidates — only under_review counts", () => {
    const baselineRun = makeRun({ runId: "run-bl-001" });
    const candRun     = makeRun({ runId: "run-cand-001", type: "candidate" });

    const candidates: CandidateRecord[] = [
      makeCandidate({
        candidateId:       "cand-1",
        revalidationRunId: "run-cand-001",
        status:            "accepted",  // ← not under_review
      }),
    ];

    const runMap: Record<string, EvaluationRun> = {
      "run-bl-001":   baselineRun,
      "run-cand-001": candRun,
    };
    const getRun = (id: string) => runMap[id];

    const result = resolveDefaultRunId(candidates, "run-bl-001", getRun);
    // Accepted candidate is ignored → baseline
    expect(result).toBe("run-bl-001");
  });
});

// ── EVID-05 ── buildRunOptions + resolve — no fixture fallback ─
describe("EVID-05: no fixture fallback in live mode", () => {
  it("buildRunOptions does not produce options when all runs are missing", () => {
    const candidates: CandidateRecord[] = [
      makeCandidate({ candidateId: "cand-1", revalidationRunId: "run-missing", status: "under_review" }),
    ];
    const opts = buildRunOptions(candidates, "run-bl-missing", () => undefined);
    expect(opts).toHaveLength(0);
  });

  it("resolveDefaultRunId returns null when runs are missing (never falls back to fixture)", () => {
    const candidates: CandidateRecord[] = [
      makeCandidate({ candidateId: "cand-1", revalidationRunId: "run-missing", status: "under_review" }),
    ];
    const result = resolveDefaultRunId(candidates, "run-bl-missing", () => undefined);
    expect(result).toBeNull();
  });

  it("switching runId via ?run= never mutates persisted data — pure functions only return IDs", () => {
    // buildRunOptions and resolveDefaultRunId are pure — they never call
    // any store mutation. Verify they are side-effect free by calling them
    // multiple times and observing no state change.
    const run1 = makeRun({ runId: "run-bl-001" });
    const run2 = makeRun({ runId: "run-cand-001", type: "candidate" });
    const candidates = [
      makeCandidate({ candidateId: "cand-1", revalidationRunId: "run-cand-001", status: "under_review" }),
    ];
    const getRun = (id: string) => ({ "run-bl-001": run1, "run-cand-001": run2 }[id]);

    // Call multiple times — no side effects
    const opts1 = buildRunOptions(candidates, "run-bl-001", getRun);
    const opts2 = buildRunOptions(candidates, "run-bl-001", getRun);
    const res1  = resolveDefaultRunId(candidates, "run-bl-001", getRun);
    const res2  = resolveDefaultRunId(candidates, "run-bl-001", getRun);

    expect(opts1).toEqual(opts2);
    expect(res1).toEqual(res2);
    expect(res1).toBe("run-cand-001");

    // run2.judgments is still empty — no mutation
    expect(run2.judgments).toHaveLength(0);
  });
});

import "server-only";
// ============================================================
// persistence.ts — durable local storage for WorkflowStore and RunStore
//
// Strategy: write-through JSON files with atomic rename.
// On server startup both stores call loadWorkflowState() /
// loadRuns() and hydrate from disk. Every mutation calls
// saveWorkflowState() / saveRuns() before returning.
//
// Atomic write prevents partial-file corruption on crash:
//   1. Write to <file>.tmp
//   2. fs.renameSync(<file>.tmp, <file>)   ← atomic on POSIX
//
// Test isolation: when NODE_ENV === "test" all I/O is skipped,
// but persistence tests may call the *explicit-path* variants
// (saveWorkflowStateTo / loadWorkflowStateFrom / saveRunsTo /
//  loadRunsFrom) with a temp directory to test the I/O layer
// directly without touching experiment-data/.
// ============================================================
import fs   from "fs";
import path from "path";
import type { EvaluationRun, ExperimentBaselineRun, ExperimentRecord } from "@/core/types";
import { rejectHistoricalArtifactWrite } from "@/data/historical-experiment";

// Re-imported here to avoid circular deps with workflow-store.ts
// WorkflowState is defined locally (mirrored) — we use unknown
// and cast at call sites so the type stays in workflow-store.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyState = any;

// ── Paths ─────────────────────────────────────────────────────
export const PERSIST_DIR   = path.join(process.cwd(), "experiment-data");
export const WORKFLOW_FILE = path.join(PERSIST_DIR, "workflow-state.json");
export const RUNS_FILE     = path.join(PERSIST_DIR, "run-store.json");
export const EXPERIMENTS_FILE = path.join(PERSIST_DIR, "active-experiments.json");
export const EXPERIMENT_RUNS_FILE = path.join(PERSIST_DIR, "experiment-runs.json");

export interface ExperimentFileState {
  activeExperimentId: string;
  experiments: ExperimentRecord[];
}

export interface ExperimentRunFileState {
  runs: ExperimentBaselineRun[];
}

// ── Environment guard ─────────────────────────────────────────
// In test mode, skip real I/O in the store. Persistence tests
// use the explicit-path variants below instead.
function isTestEnv(): boolean {
  return process.env.NODE_ENV === "test";
}

// ── Low-level helpers ─────────────────────────────────────────

/** Ensure the directory for the given file path exists. */
function ensureFileDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

/** Atomic write: write to .tmp then rename. */
function atomicWrite(filePath: string, data: AnyState): void {
  rejectHistoricalArtifactWrite(filePath);
  rejectHistoricalArtifactWrite(filePath + ".tmp");
  ensureFileDir(filePath);
  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, filePath);
}

/** Read and parse a JSON file. Returns null on any error. */
function safeParse(filePath: string): AnyState | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ── WorkflowState I/O ─────────────────────────────────────────

/** Load persisted WorkflowState. Returns null if no file exists or is corrupt. */
export function loadWorkflowState(): AnyState | null {
  if (isTestEnv()) return null;
  return safeParse(WORKFLOW_FILE);
}

/** Persist WorkflowState to disk atomically. No-op in test env. */
export function saveWorkflowState(state: AnyState): void {
  if (isTestEnv()) return;
  atomicWrite(WORKFLOW_FILE, state);
}

// ── RunStore I/O ──────────────────────────────────────────────

/** Load persisted runs array. Returns null if no file exists or is corrupt. */
export function loadRuns(): EvaluationRun[] | null {
  if (isTestEnv()) return null;
  const data = safeParse(RUNS_FILE);
  if (!Array.isArray(data)) return null;
  return data as EvaluationRun[];
}

/** Persist runs array to disk atomically. No-op in test env. */
export function saveRuns(runs: EvaluationRun[]): void {
  if (isTestEnv()) return;
  atomicWrite(RUNS_FILE, runs);
}

// ── Reset ─────────────────────────────────────────────────────

/** Delete both persisted files. Called only by explicit Reset Experiment action. */
export function clearPersistedState(): void {
  if (isTestEnv()) return;
  rejectHistoricalArtifactWrite(WORKFLOW_FILE);
  rejectHistoricalArtifactWrite(RUNS_FILE);
  for (const f of [WORKFLOW_FILE, RUNS_FILE]) {
    try { fs.unlinkSync(f); } catch { /* already gone */ }
    try { fs.unlinkSync(f + ".tmp"); } catch { /* already gone */ }
  }
}

// ── Explicit-path variants (for persistence tests) ────────────
// These always perform real I/O regardless of NODE_ENV, using
// caller-supplied file paths so tests use temp directories.

export function saveWorkflowStateTo(state: AnyState, filePath: string): void {
  atomicWrite(filePath, state);
}

export function loadWorkflowStateFrom(filePath: string): AnyState | null {
  return safeParse(filePath);
}

export function saveRunsTo(runs: EvaluationRun[], filePath: string): void {
  atomicWrite(filePath, runs);
}

export function loadRunsFrom(filePath: string): EvaluationRun[] | null {
  const data = safeParse(filePath);
  if (!Array.isArray(data)) return null;
  return data as EvaluationRun[];
}

export function saveExperiments(state: ExperimentFileState): void {
  if (isTestEnv()) return;
  atomicWrite(EXPERIMENTS_FILE, state);
}

export function loadExperiments(): ExperimentFileState | null {
  if (isTestEnv()) return null;
  return parseExperimentFile(safeParse(EXPERIMENTS_FILE));
}

export function saveExperimentsTo(state: ExperimentFileState, filePath: string): void {
  atomicWrite(filePath, state);
}

export function loadExperimentsFrom(filePath: string): ExperimentFileState | null {
  return parseExperimentFile(safeParse(filePath));
}

export function saveExperimentRuns(state: ExperimentRunFileState): void {
  if (isTestEnv()) return;
  atomicWrite(EXPERIMENT_RUNS_FILE, state);
}

export function loadExperimentRuns(): ExperimentRunFileState | null {
  if (isTestEnv()) return null;
  return parseExperimentRuns(safeParse(EXPERIMENT_RUNS_FILE));
}

export function saveExperimentRunsTo(state: ExperimentRunFileState, filePath: string): void {
  atomicWrite(filePath, state);
}

export function loadExperimentRunsFrom(filePath: string): ExperimentRunFileState | null {
  return parseExperimentRuns(safeParse(filePath));
}

function parseExperimentRuns(data: AnyState | null): ExperimentRunFileState | null {
  if (!data || typeof data !== "object" || !Array.isArray(data.runs)) return null;
  return data as ExperimentRunFileState;
}

function parseExperimentFile(data: AnyState | null): ExperimentFileState | null {
  if (!data || typeof data !== "object" || !Array.isArray(data.experiments)) return null;
  if (typeof data.activeExperimentId !== "string") return null;
  return data as ExperimentFileState;
}

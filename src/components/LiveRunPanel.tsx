"use client";
// ============================================================
// LiveRunPanel — execution UX for live OpenAI evaluation runs
//
// Responsibilities:
//   - "RUN LIVE BASELINE" / "RUN LIVE REVALIDATION" button
//   - Pre-run confirmation: model, n cases, LIVE badge, request count
//   - Client-side loop: calls actionJudgeCase once per case
//   - Real-time progress counter: 0/60 → 60/60
//   - Status LED (PENDING / RUNNING / COMPLETED / PARTIAL_FAILURE / FAILED)
//   - "Retry Failed" button for partial failures
//   - Disables during active run (no duplicate execution)
//
// State management:
//   - Server passes existingRun for hydration on page load.
//   - All run execution state is local during the run.
//   - On completeRun, server revalidatePath causes re-render.
// ============================================================
import { useState, useTransition, useRef } from "react";
import type { EvaluationRun, LiveJudgment } from "@/core/types";
import {
  actionCreateRun,
  actionJudgeCase,
  actionCompleteRun,
  actionRetryCase,
} from "@/app/actions/runs";

interface Props {
  type: "baseline" | "candidate";
  sampleCaseIds: string[];
  rubricText: string;
  evaluatorVersion: string;
  rubricVersion: string;
  taxonomyVersion: string;
  model: string;
  existingRun?: EvaluationRun;
}

type LocalStatus =
  | "idle"
  | "confirming"
  | "running"
  | "retrying"
  | "completed"
  | "partial_failure"
  | "failed";

function StatusDot({ status }: { status: LocalStatus }) {
  const styles: Record<LocalStatus, string> = {
    idle:            "bg-jh-border-lt",
    confirming:      "bg-jh-led-amber shadow-[0_0_5px_var(--jh-led-amber)]",
    running:         "bg-jh-led-amber shadow-[0_0_5px_var(--jh-led-amber)] animate-pulse",
    retrying:        "bg-jh-led-amber shadow-[0_0_5px_var(--jh-led-amber)] animate-pulse",
    completed:       "bg-jh-led-green shadow-[0_0_4px_var(--jh-led-green)]",
    partial_failure: "bg-jh-led-amber shadow-[0_0_4px_var(--jh-led-amber)]",
    failed:          "bg-jh-red",
  };
  return <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${styles[status]}`} />;
}

const STATUS_LABEL: Record<LocalStatus, string> = {
  idle:            "READY",
  confirming:      "CONFIRM",
  running:         "RUNNING",
  retrying:        "RETRYING",
  completed:       "COMPLETED",
  partial_failure: "PARTIAL",
  failed:          "FAILED",
};

export function LiveRunPanel({
  type,
  sampleCaseIds,
  rubricText,
  evaluatorVersion,
  rubricVersion,
  taxonomyVersion,
  model,
  existingRun,
}: Props) {
  // Hydrate from server-side run if available
  const getInitialStatus = (): LocalStatus => {
    if (!existingRun) return "idle";
    if (existingRun.status === "completed") return "completed";
    if (existingRun.status === "partial_failure") return "partial_failure";
    if (existingRun.status === "failed") return "failed";
    return "idle";
  };

  const [localStatus, setLocalStatus]   = useState<LocalStatus>(getInitialStatus);
  const [progress, setProgress]         = useState(() => existingRun?.judgments.length ?? 0);
  const [errorCount, setErrorCount]     = useState(() => existingRun?.errors.length ?? 0);
  const [runId, setRunId]               = useState<string | undefined>(existingRun?.runId);
  const [judgments, setJudgments]       = useState<LiveJudgment[]>(existingRun?.judgments ?? []);
  const [lastError, setLastError]       = useState<string | null>(null);
  // Local error case IDs — updated as retries resolve, independent of existingRun prop
  const [localErrorIds, setLocalErrorIds] = useState<string[]>(
    () => existingRun?.errors.map((e) => e.caseId) ?? []
  );
  const [, startTransition]             = useTransition();
  const abortRef                        = useRef(false);

  const total = sampleCaseIds.length;
  const buttonLabel = type === "baseline" ? "RUN LIVE BASELINE" : "RUN LIVE REVALIDATION";
  const isActive = localStatus === "running" || localStatus === "retrying" || localStatus === "confirming";

  // ── Execute the run loop ────────────────────────────────────
  async function executeRun(activeRunId: string, caseIds: string[], isRetry = false) {
    abortRef.current = false;
    setLocalStatus(isRetry ? "retrying" : "running");
    setLastError(null);

    let done = isRetry ? progress : 0;
    let errors = isRetry ? errorCount : 0;

    if (!isRetry) {
      setProgress(0);
      setErrorCount(0);
      setJudgments([]);
    }

    for (const caseId of caseIds) {
      if (abortRef.current) break;

      const action = isRetry ? actionRetryCase : actionJudgeCase;
      const result = await action({
        runId: activeRunId,
        caseId,
        rubricText,
        evaluatorVersion,
        rubricVersion,
      });

      if (result.ok) {
        done++;
        setProgress(done);
        setJudgments((prev) => [...prev, result.judgment]);
        // Remove resolved case from local error list
        if (isRetry) {
          setLocalErrorIds((prev) => prev.filter((id) => id !== caseId));
        }
      } else {
        errors++;
        setErrorCount(errors);
        setLastError(result.error);
      }
    }

    // Always call completeRun at the end — for retries this re-computes the final
    // status (completed vs partial_failure) and triggers revalidatePath on the server.
    startTransition(async () => {
      await actionCompleteRun(activeRunId);
    });

    if (errors === 0) {
      setLocalStatus("completed");
    } else if (done > 0) {
      setLocalStatus("partial_failure");
    } else {
      setLocalStatus("failed");
    }
  }

  // ── Start new run ───────────────────────────────────────────
  async function handleStart() {
    setLocalStatus("running");
    try {
      const { runId: newRunId } = await actionCreateRun({
        type,
        mode: "live",
        evaluatorVersion,
        rubricVersion,
        taxonomyVersion,
        sampleIds: sampleCaseIds,
        rubricText,
      });
      setRunId(newRunId);
      await executeRun(newRunId, sampleCaseIds, false);
    } catch (err) {
      setLocalStatus("failed");
      setLastError(err instanceof Error ? err.message : String(err));
    }
  }

  // ── Retry failed cases ──────────────────────────────────────
  async function handleRetry() {
    const activeRunId = runId ?? existingRun?.runId;
    if (!activeRunId) return;
    // Use local state (not stale existingRun prop) so already-resolved errors are excluded
    const failedIds = localErrorIds;
    if (failedIds.length === 0) return;
    await executeRun(activeRunId, failedIds, true);
  }

  // ── Completed view ──────────────────────────────────────────
  if (localStatus === "completed" && (existingRun?.status === "completed" || progress === total)) {
    return (
      <div className="border border-jh-green/40 bg-green-50/10 px-4 py-3 font-mono text-[10px] flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <StatusDot status="completed" />
          <div>
            <span className="text-jh-green font-semibold">
              LIVE {type === "baseline" ? "BASELINE" : "REVALIDATION"} COMPLETE
            </span>
            <span className="text-jh-dim ml-3">
              {progress} / {total} cases · {model}
            </span>
          </div>
        </div>
        <span className="text-jh-dim text-[9px] uppercase tracking-wide">
          Run ID: {runId ?? existingRun?.runId}
        </span>
      </div>
    );
  }

  // ── Active run: progress view ───────────────────────────────
  if (localStatus === "running" || localStatus === "retrying") {
    const pct = total > 0 ? Math.round((progress / total) * 100) : 0;
    return (
      <div className="border border-jh-border bg-jh-panel p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StatusDot status={localStatus} />
            <span className="font-mono text-[11px] font-semibold text-jh-text">
              {localStatus === "retrying" ? "RETRYING FAILED CASES" : `LIVE ${type === "baseline" ? "BASELINE" : "REVALIDATION"} RUNNING`}
            </span>
          </div>
          <span className="font-mono text-[10px] text-jh-dim">{model}</span>
        </div>

        {/* Progress counter */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between font-mono text-[11px]">
            <span className="text-jh-text font-bold tabular-nums">{progress} / {total}</span>
            <span className="text-jh-dim">{pct}%</span>
          </div>
          {/* Progress bar */}
          <div className="h-1.5 bg-jh-border-lt rounded-full overflow-hidden">
            <div
              className="h-full bg-jh-led-green transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Error indicator */}
        {errorCount > 0 && (
          <div className="font-mono text-[10px] text-jh-amber">
            {errorCount} case{errorCount > 1 ? "s" : ""} failed
            {lastError && <span className="text-jh-dim ml-2 truncate">({lastError.slice(0, 60)})</span>}
          </div>
        )}

        {/* Latest judgments */}
        {judgments.length > 0 && (
          <div className="border-t border-jh-border-lt pt-2 space-y-1">
            <div className="font-mono text-[9px] text-jh-dim uppercase tracking-wide">
              Recent judgments
            </div>
            {[...judgments].reverse().slice(0, 3).map((j) => (
              <div key={j.caseId} className="font-mono text-[10px] flex items-center gap-2">
                <span className={j.label === "FAIL" ? "text-jh-red font-bold" : "text-jh-green font-bold"}>
                  {j.label}
                </span>
                <span className="text-jh-dim">{j.caseId}</span>
                <span className="text-jh-dim truncate flex-1" title={j.rationale}>
                  {j.rationale.slice(0, 60)}…
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Confirming view ─────────────────────────────────────────
  if (localStatus === "confirming") {
    return (
      <div className="border border-jh-border bg-jh-panel p-4 space-y-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-jh-dim">
          Confirm Live Evaluation Run
        </div>

        <div className="border border-jh-amber/50 bg-amber-50/20 px-3 py-2 font-mono text-[10px] text-jh-amber space-y-0.5">
          <div className="font-semibold uppercase tracking-wide">LIVE MODE · REAL API CALLS</div>
          <div>This will send real requests to OpenAI and incur API costs.</div>
        </div>

        <div className="border border-jh-border-lt bg-jh-bg/40 p-3 space-y-1.5 font-mono text-[10px]">
          {[
            { label: "Model",      value: model },
            { label: "Run type",   value: type === "baseline" ? "Live Baseline" : "Live Revalidation" },
            { label: "Cases",      value: `${total} cases (rep + targeted/risk)` },
            { label: "Requests",   value: `~${total} API calls` },
            { label: "Evaluator",  value: evaluatorVersion },
            { label: "Rubric",     value: rubricVersion },
          ].map(({ label, value }) => (
            <div key={label} className="flex gap-3">
              <span className="text-jh-dim w-24 shrink-0">{label}</span>
              <span className="text-jh-text">{value}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-3 pt-1 border-t border-jh-border-lt">
          <button
            onClick={handleStart}
            className="font-mono text-[11px] border border-jh-amber/70 text-jh-amber px-4 py-2 hover:bg-amber-50/30 transition-colors"
          >
            Confirm — Run {total} Cases
          </button>
          <button
            onClick={() => setLocalStatus("idle")}
            className="font-mono text-[11px] text-jh-dim hover:text-jh-text transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Partial failure view ────────────────────────────────────
  if (localStatus === "partial_failure") {
    // Use localErrorIds (kept in sync during retries), not stale existingRun prop
    const failedIds = localErrorIds;
    return (
      <div className="border border-jh-amber/60 bg-jh-panel p-4 space-y-3">
        <div className="flex items-center gap-3">
          <StatusDot status="partial_failure" />
          <div>
            <div className="font-mono text-[11px] font-semibold text-jh-amber">
              PARTIAL COMPLETION — {progress} / {total} cases succeeded
            </div>
            <div className="font-mono text-[10px] text-jh-dim mt-0.5">
              {failedIds.length} case{failedIds.length > 1 ? "s" : ""} failed. Metrics exclude failed cases.
            </div>
          </div>
        </div>
        {lastError && (
          <div className="font-mono text-[10px] text-jh-dim border border-jh-border-lt px-2 py-1">
            Last error: {lastError.slice(0, 200)}
          </div>
        )}
        {failedIds.length > 0 && (
          <button
            onClick={handleRetry}
            disabled={isActive}
            className="font-mono text-[11px] border border-jh-amber/70 text-jh-amber px-4 py-1.5 hover:bg-amber-50/30 transition-colors disabled:opacity-40"
          >
            Retry {failedIds.length} Failed Case{failedIds.length > 1 ? "s" : ""}
          </button>
        )}
      </div>
    );
  }

  // ── Failed view ─────────────────────────────────────────────
  if (localStatus === "failed") {
    return (
      <div className="border border-jh-red/50 bg-red-50/10 p-4 space-y-3">
        <div className="flex items-center gap-3">
          <StatusDot status="failed" />
          <span className="font-mono text-[11px] font-semibold text-jh-red">
            RUN FAILED
          </span>
        </div>
        {lastError && (
          <div className="font-mono text-[10px] text-jh-dim">{lastError.slice(0, 300)}</div>
        )}
        <button
          onClick={() => setLocalStatus("idle")}
          className="font-mono text-[10px] border border-jh-border text-jh-dim px-3 py-1.5 hover:bg-jh-bg transition-colors"
        >
          Dismiss
        </button>
      </div>
    );
  }

  // ── Idle view — primary button ──────────────────────────────
  return (
    <div className="border border-jh-border-lt bg-jh-panel px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <StatusDot status="idle" />
          <div>
            <div className="font-mono text-[11px] font-semibold text-jh-text">
              {buttonLabel}
            </div>
            <div className="font-mono text-[10px] text-jh-dim mt-0.5">
              {total} cases · {model} · real OpenAI calls
            </div>
          </div>
        </div>
        <button
          onClick={() => setLocalStatus("confirming")}
          disabled={isActive}
          className="font-mono text-[11px] border border-jh-border px-4 py-2 hover:bg-jh-bg transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {buttonLabel} →
        </button>
      </div>
    </div>
  );
}

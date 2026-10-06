"use client";
// ============================================================
// SmokeTestPanel — pre-run validation for a single case
//
// Calls actionSmokeTest() for a specific case ID before
// spending the full 140 API calls. Shows label + rationale.
// Also exposes actionResetRuns() for experiment reset.
// ============================================================
import { useState, useTransition } from "react";
import { actionSmokeTest, actionResetRuns } from "@/app/actions/runs";
import type { SmokeTestResult } from "@/app/actions/runs";

interface Props {
  smokeCaseId: string;
  rubricText: string;
  evaluatorVersion: string;
  rubricVersion: string;
}

export function SmokeTestPanel({ smokeCaseId, rubricText, evaluatorVersion, rubricVersion }: Props) {
  const [result, setResult]           = useState<SmokeTestResult | null>(null);
  const [isPending, startTransition]  = useTransition();
  const [isResetting, startReset]     = useTransition();
  const [resetDone, setResetDone]     = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  function handleSmokeTest() {
    setResult(null);
    startTransition(async () => {
      const r = await actionSmokeTest({
        caseId: smokeCaseId,
        rubricText,
        evaluatorVersion,
        rubricVersion,
      });
      setResult(r);
    });
  }

  function handleReset() {
    startReset(async () => {
      await actionResetRuns();
      setResetDone(true);
      setConfirmReset(false);
      setResult(null);
    });
  }

  return (
    <div className="border border-jh-border-lt bg-jh-panel p-4 space-y-4 font-mono">
      <div className="text-[9px] text-jh-dim uppercase tracking-[0.18em]">
        Pre-Run Checks
      </div>

      {/* ── Smoke test ───────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[11px] text-jh-text font-semibold">Smoke Test — {smokeCaseId}</div>
            <div className="text-[10px] text-jh-dim">1 API call · validates evaluator + system prompt before full run</div>
          </div>
          <button
            onClick={handleSmokeTest}
            disabled={isPending}
            className="text-[11px] border border-jh-border px-4 py-2 hover:bg-jh-bg transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
          >
            {isPending ? "Testing…" : `Test ${smokeCaseId} →`}
          </button>
        </div>

        {result && (
          <div className={`border px-3 py-2 space-y-1 text-[10px] ${
            result.ok ? "border-jh-green/50 bg-green-50/10" : "border-jh-red/50 bg-red-50/10"
          }`}>
            {result.ok ? (
              <>
                <div className="flex items-center gap-3">
                  <span className={`font-bold text-[11px] ${result.label === "FAIL" ? "text-jh-red" : "text-jh-green"}`}>
                    {result.label}
                  </span>
                  <span className="text-jh-dim">{result.durationMs}ms</span>
                  <span className="text-jh-green">✓ evaluator responding correctly</span>
                </div>
                {result.rationale && (
                  <p className="text-jh-dim italic leading-relaxed border-t border-jh-border-lt pt-1 mt-1">
                    &ldquo;{result.rationale}&rdquo;
                  </p>
                )}
              </>
            ) : (
              <div className="text-jh-red">
                <span className="font-semibold">FAILED</span>
                {result.error && <span className="ml-2 text-jh-dim">{result.error.slice(0, 200)}</span>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Reset ────────────────────────────────────────────── */}
      <div className="border-t border-jh-border-lt pt-3 space-y-2">
        <div className="text-[10px] text-jh-dim">
          Reset all run state (RunStore + WorkflowStore). Implementation and fixtures are preserved.
          Use before starting a new experiment run.
        </div>

        {!confirmReset && !resetDone && (
          <button
            onClick={() => setConfirmReset(true)}
            disabled={isResetting}
            className="text-[10px] border border-jh-red/40 text-jh-red px-3 py-1.5 hover:bg-red-50/20 transition-colors"
          >
            Reset All Runs →
          </button>
        )}

        {confirmReset && (
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-jh-red">This will erase all run results. Are you sure?</span>
            <button
              onClick={handleReset}
              disabled={isResetting}
              className="text-[10px] border border-jh-red text-jh-red px-3 py-1.5 hover:bg-red-50/30 transition-colors disabled:opacity-40"
            >
              {isResetting ? "Resetting…" : "Confirm Reset"}
            </button>
            <button
              onClick={() => setConfirmReset(false)}
              className="text-[10px] text-jh-dim hover:text-jh-text transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {resetDone && (
          <div className="text-[10px] text-jh-green">
            ✓ Reset complete — reload the page to start fresh.
            <button
              onClick={() => window.location.reload()}
              className="ml-3 border border-jh-green/50 px-2 py-0.5 hover:bg-green-50/20 transition-colors"
            >
              Reload →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

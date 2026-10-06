// ============================================================
// /settings — Instrument Configuration & Experiment Management
//
// Server component. Read-only display + Reset Experiment action.
// The Reset Experiment button is the ONLY way to wipe persisted
// experiment state. It is deliberately separate from any
// automated workflow path.
//
// NEVER call actionResetExperiment automatically.
// User must click the button and confirm the intent.
// ============================================================
import { PERSIST_DIR, WORKFLOW_FILE, RUNS_FILE } from "@/data/persistence";
import { WorkflowStore } from "@/data/workflow-store";
import { RunStore } from "@/data/run-store";
import { actionResetExperiment } from "@/app/actions/workflow";
import fs from "fs";

// ── Helpers ───────────────────────────────────────────────────

function fileStatus(filePath: string): { exists: boolean; sizeKb: string; mtime: string } {
  try {
    const stat = fs.statSync(filePath);
    return {
      exists: true,
      sizeKb: (stat.size / 1024).toFixed(1),
      mtime: stat.mtime.toISOString(),
    };
  } catch {
    return { exists: false, sizeKb: "—", mtime: "—" };
  }
}

// ── Page ──────────────────────────────────────────────────────

export default function SettingsPage() {
  const workflowStat = fileStatus(WORKFLOW_FILE);
  const runsStat     = fileStatus(RUNS_FILE);

  const candidates   = WorkflowStore.getAllCandidates();
  const runs         = RunStore.getAllRuns();
  const baselineRunId = WorkflowStore.getBaselineRunId();
  const diagnosis    = WorkflowStore.getDiagnosis();

  const acceptedCandidate = candidates.find((c) => c.status === "accepted");
  const liveRuns = runs.filter((r) => r.mode === "live" && r.status === "completed");

  return (
    <main className="min-h-screen bg-jh-bg p-3 lg:p-4">
      <div className="max-w-[720px] mx-auto space-y-5">

        {/* Header */}
        <div className="border-b border-jh-border-lt pb-3">
          <div className="font-mono text-[9px] text-jh-dim uppercase tracking-[0.18em] mb-0.5">
            JH-001 · Configuration
          </div>
          <h2 className="font-sketch text-[1.6rem] font-bold leading-none tracking-wide text-jh-text">
            Settings
          </h2>
          <p className="font-mono text-[11px] text-jh-dim mt-1">
            Instrument configuration and experiment management
          </p>
        </div>

        {/* Persistence status */}
        <div className="border border-jh-border-lt bg-jh-panel">
          <div className="border-b border-jh-border-lt px-3 py-[5px]">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-jh-dim">
              Persistence Status
            </span>
          </div>
          <div className="p-3 space-y-3 font-mono text-[10px]">

            <div className="flex flex-col gap-1 border border-jh-border-lt px-3 py-2">
              <div className="text-[9px] uppercase tracking-wide text-jh-dim mb-1">Storage Root</div>
              <div className="text-jh-text break-all">{PERSIST_DIR}</div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {/* Workflow state file */}
              <div className={`border px-3 py-2 space-y-1 ${workflowStat.exists ? "border-jh-green/40 bg-green-50/10" : "border-jh-border-lt"}`}>
                <div className="text-[9px] uppercase tracking-wide text-jh-dim">workflow-state.json</div>
                <div className={workflowStat.exists ? "text-jh-green font-semibold" : "text-jh-dim"}>
                  {workflowStat.exists ? "PRESENT" : "NOT FOUND"}
                </div>
                {workflowStat.exists && (
                  <>
                    <div className="text-jh-dim">{workflowStat.sizeKb} KB</div>
                    <div className="text-jh-dim text-[9px]">{new Date(workflowStat.mtime).toLocaleString()}</div>
                  </>
                )}
              </div>

              {/* Run store file */}
              <div className={`border px-3 py-2 space-y-1 ${runsStat.exists ? "border-jh-green/40 bg-green-50/10" : "border-jh-border-lt"}`}>
                <div className="text-[9px] uppercase tracking-wide text-jh-dim">run-store.json</div>
                <div className={runsStat.exists ? "text-jh-green font-semibold" : "text-jh-dim"}>
                  {runsStat.exists ? "PRESENT" : "NOT FOUND"}
                </div>
                {runsStat.exists && (
                  <>
                    <div className="text-jh-dim">{runsStat.sizeKb} KB</div>
                    <div className="text-jh-dim text-[9px]">{new Date(runsStat.mtime).toLocaleString()}</div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Current experiment summary */}
        <div className="border border-jh-border-lt bg-jh-panel">
          <div className="border-b border-jh-border-lt px-3 py-[5px]">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-jh-dim">
              Current Experiment State
            </span>
          </div>
          <div className="p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[10px]">
            <div className="border border-jh-border-lt px-2 py-2 text-center">
              <div className="text-[9px] uppercase tracking-wide text-jh-dim mb-1">Baseline Run</div>
              <div className={baselineRunId ? "text-jh-green font-semibold" : "text-jh-dim"}>
                {baselineRunId ? "PRESENT" : "NONE"}
              </div>
            </div>
            <div className="border border-jh-border-lt px-2 py-2 text-center">
              <div className="text-[9px] uppercase tracking-wide text-jh-dim mb-1">Diagnosis</div>
              <div className={diagnosis ? "text-jh-amber font-semibold" : "text-jh-dim"}>
                {diagnosis ? diagnosis.status.toUpperCase() : "NONE"}
              </div>
            </div>
            <div className="border border-jh-border-lt px-2 py-2 text-center">
              <div className="text-[9px] uppercase tracking-wide text-jh-dim mb-1">Candidates</div>
              <div className="text-jh-text font-semibold text-base tabular-nums">{candidates.length}</div>
            </div>
            <div className="border border-jh-border-lt px-2 py-2 text-center">
              <div className="text-[9px] uppercase tracking-wide text-jh-dim mb-1">Live Runs</div>
              <div className="text-jh-text font-semibold text-base tabular-nums">{liveRuns.length}</div>
            </div>
          </div>
          {acceptedCandidate && (
            <div className="border-t border-jh-border-lt px-3 py-2 font-mono text-[10px]">
              <span className="text-jh-dim uppercase tracking-wide text-[9px] mr-2">Accepted:</span>
              <span className="text-jh-green font-semibold">{acceptedCandidate.evaluatorVersion}</span>
              <span className="text-jh-dim ml-2">({acceptedCandidate.rubricVersion})</span>
            </div>
          )}
        </div>

        {/* Reset Experiment — destructive */}
        <div className="border border-jh-red/40 bg-red-50/10">
          <div className="border-b border-jh-red/30 px-3 py-[5px] flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-jh-red">
              Reset Experiment
            </span>
            <span className="font-mono text-[9px] text-jh-red/60 border border-jh-red/30 px-1.5 py-0.5">
              DESTRUCTIVE
            </span>
          </div>
          <div className="p-3 space-y-3">
            <p className="font-mono text-[10px] text-jh-dim leading-relaxed">
              Permanently deletes all in-memory and persisted experiment state:
              baseline run, diagnosis, all interventions, candidates, revalidation runs,
              decisions, and judgments. This action is irreversible.
            </p>
            <p className="font-mono text-[10px] text-jh-red">
              Use only before starting a new calibration experiment from scratch.
              Do NOT use while an experiment is in progress.
            </p>
            <form action={actionResetExperiment}>
              <button
                type="submit"
                className="font-mono text-[11px] font-semibold border-2 border-jh-red text-jh-red px-4 py-2 hover:bg-jh-red hover:text-white transition-colors uppercase tracking-[0.12em]"
              >
                Reset Experiment ✕
              </button>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="font-mono text-[10px] text-jh-dim pt-1">
          JH-001 · AACI Framework · Calibration Instrument · Settings
        </div>

      </div>
    </main>
  );
}

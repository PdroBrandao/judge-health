// ============================================================
// /intervention — Intervention Screen
//
// Server component. Reads the active diagnosis from WorkflowStore.
// If no diagnosis exists, redirects to /diagnose.
// Shows the baseline evaluator/rubric info and the InterventionClient.
// ============================================================
import { redirect } from "next/navigation";
import { WorkflowStore } from "@/data/workflow-store";
import { FixtureRepository } from "@/data/fixture-repository";
import { InstrumentPanel } from "@/components/instrument/InstrumentPanel";
import { StatusLED } from "@/components/instrument/StatusLED";
import { InterventionClient } from "./InterventionClient";

// Single source of truth — same text sent to OpenAI in baseline runs
import { ACTIVE_RUBRIC_TEXT as BASELINE_RUBRIC_TEXT } from "@/data/rubric-text";

export default function InterventionPage() {
  const diagnosis = WorkflowStore.getDiagnosis();

  // Invariant: cannot create intervention without diagnosis
  if (!diagnosis) {
    redirect("/diagnose");
  }

  const existingIntervention  = WorkflowStore.getCurrentIntervention();
  const revalidationDecision  = WorkflowStore.getCurrentDecision();
  const allInterventions      = WorkflowStore.getAllInterventions();
  const allDecisions          = WorkflowStore.getAllDecisions();
  const activeVersion  = FixtureRepository.getActiveEvaluatorVersion();
  const activeRubric   = FixtureRepository.getActiveRubricVersion();

  // RC-3 fix: key changes when a new attempt starts, forcing InterventionClient
  // to fully remount and reinitialize all useState hooks with fresh default values.
  const attemptKey = allInterventions.length;

  // Incremental rubric pre-fill:
  // Attempt #1 → pre-fill with the immutable baseline rubric.
  // Attempt #N (N > 1) → pre-fill with the rubricText of the most recently
  // rejected CandidateRecord, so each attempt builds on the previous one
  // rather than discarding all prior rubric work.
  // The original BASELINE_RUBRIC_TEXT is never mutated.
  const allCandidates      = WorkflowStore.getAllCandidates();
  const lastRejectedCand   = [...allCandidates].reverse().find((c) => c.status === "rejected");
  const startingRubricText = lastRejectedCand?.rubricText ?? BASELINE_RUBRIC_TEXT;

  return (
    <main className="min-h-screen bg-jh-bg p-3 lg:p-4">
      <div className="max-w-[900px] mx-auto space-y-4">

        {/* ── Page identity ─────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-jh-border-lt pb-3">
          <div>
            <h2 className="font-sketch text-[1.6rem] font-bold leading-none tracking-wide text-jh-text">
              Intervention
            </h2>
            <p className="font-mono text-[11px] text-jh-dim mt-1">
              Propose rubric changes that address the diagnosed issue. Creates a candidate for revalidation.
            </p>
          </div>
          <StatusLED
            status={existingIntervention ? "ok" : "warn"}
            label={existingIntervention ? "Intervention recorded" : "Pending intervention"}
          />
        </div>

        {/* ── Baseline evaluator context ─────────────────────── */}
        <InstrumentPanel label="Baseline — Active Evaluator" noPadding>
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-jh-border-lt">
            {[
              { label: "VERSION",  value: activeVersion.version },
              { label: "STATUS",   value: activeVersion.status.toUpperCase() },
              { label: "RUBRIC",   value: activeRubric.version },
              { label: "TAXONOMY", value: activeVersion.taxonomyVersion },
            ].map(({ label, value }) => (
              <div key={label} className="px-4 py-3">
                <div className="font-mono font-bold text-sm tabular-nums text-jh-text">
                  {value}
                </div>
                <div className="font-mono text-[9px] text-jh-dim uppercase tracking-wide mt-0.5">
                  {label}
                </div>
              </div>
            ))}
          </div>
          <div className="px-4 py-2 border-t border-jh-border-lt bg-jh-bg/40 font-mono text-[10px] text-jh-dim">
            {activeRubric.description}
          </div>
        </InstrumentPanel>

        {/* ── Workflow steps ─────────────────────────────────── */}
        <div className="font-mono text-[10px] text-jh-dim flex items-center gap-2">
          <a href="/diagnose" className="hover:text-jh-text transition-colors">Diagnose</a>
          <span className="text-jh-border">›</span>
          <span className="text-jh-text font-semibold">Intervention</span>
          <span className="text-jh-border">›</span>
          <a href="/revalidation" className="hover:text-jh-text transition-colors">Revalidation</a>
        </div>

        {/* ── Intervention form/view ─────────────────────────── */}
        <InstrumentPanel
          label={existingIntervention ? "Intervention On Record" : "Create Intervention"}
          accent={existingIntervention ? "ok" : undefined}
        >
          <InterventionClient
            key={attemptKey}
            diagnosis={diagnosis}
            baselineEvaluatorVersion={activeVersion.version}
            baselineRubricVersion={activeRubric.version}
            baselineTaxonomyVersion={activeVersion.taxonomyVersion}
            currentRubricText={startingRubricText}
            existingIntervention={existingIntervention}
            revalidationDecision={revalidationDecision}
            previousAttemptCount={allDecisions.filter((d) => d.decision === "rejected").length}
          />
        </InstrumentPanel>

      </div>
    </main>
  );
}

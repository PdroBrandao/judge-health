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
import { activeWorkspace } from "@/data/experiment-store";
import { getBaselineRunForExperiment } from "@/data/experiment-run-store";
import type { ExperimentRecord } from "@/core/types";

function ExperimentIntervention({ experiment }: { experiment: ExperimentRecord }) {
  const run = getBaselineRunForExperiment(experiment.id);
  const diagnosis = experiment.workflow.diagnosis;
  if (!run || run.status !== "completed" || !diagnosis) {
    redirect("/diagnose");
  }
  const candidate = experiment.workflow.configs.find(
    (item) => item.id === experiment.workflow.currentCandidateConfigId,
  ) ?? null;
  const intervention = candidate
    ? experiment.workflow.interventions.find((item) => item.id === experiment.workflow.currentInterventionId) ?? null
    : null;
  const rejectedRubric = [...experiment.workflow.configs].reverse().find((item) => (
    experiment.workflow.decisions.some((decision) => decision.candidateId === item.id && decision.decision === "rejected")
  ));
  const startingRubric = rejectedRubric?.rubricText ?? experiment.config.rubricText;

  return (
    <main className="min-h-screen bg-jh-bg p-3 lg:p-4">
      <div className="max-w-[900px] mx-auto space-y-4">
        <div className="flex items-center justify-between border-b border-jh-border-lt pb-3">
          <div>
            <h2 className="font-sketch text-[1.6rem] font-bold leading-none tracking-wide text-jh-text">
              Intervention
            </h2>
            <p className="font-mono text-[11px] text-jh-dim mt-1">
              {experiment.name}. Propose rubric changes. This creates a new configuration and leaves the baseline in place.
            </p>
          </div>
          <StatusLED
            status={candidate ? "ok" : "warning"}
            label={candidate ? "Candidate configuration recorded" : "Pending intervention"}
          />
        </div>

        <InstrumentPanel label="Baseline configuration" noPadding>
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-jh-border-lt">
            {[
              { label: "CONFIG", value: experiment.config.version },
              { label: "MODEL", value: experiment.config.modelId },
              { label: "RUBRIC", value: experiment.config.rubricVersion },
              { label: "PARENT", value: experiment.config.parentConfigId ?? "none" },
            ].map(({ label, value }) => (
              <div key={label} className="px-4 py-3">
                <div className="font-mono font-bold text-sm text-jh-text break-all">{value}</div>
                <div className="font-mono text-[9px] text-jh-dim uppercase tracking-wide mt-0.5">{label}</div>
              </div>
            ))}
          </div>
          <pre className="px-4 py-3 border-t border-jh-border-lt font-mono text-[10px] text-jh-text whitespace-pre-wrap max-h-48 overflow-auto">
            {experiment.config.rubricText}
          </pre>
        </InstrumentPanel>

        {candidate && (
          <InstrumentPanel label="Candidate configuration" accent="ok">
            <div className="space-y-1 font-mono text-[10px]">
              <div>Version <span className="text-jh-text">{candidate.version}</span></div>
              <div>Parent <span className="text-jh-text">{candidate.parentConfigId}</span></div>
              <div>Rubric <span className="text-jh-text">{candidate.rubricVersion}</span></div>
              <div className="text-jh-dim">Baseline {experiment.config.id} remains the current configuration. Evaluation of this candidate is the next step.</div>
            </div>
          </InstrumentPanel>
        )}

        <div className="font-mono text-[10px] text-jh-dim flex items-center gap-2">
          <a href="/diagnose" className="hover:text-jh-text transition-colors">Diagnose</a>
          <span className="text-jh-border">›</span>
          <span className="text-jh-text font-semibold">Intervention</span>
          <span className="text-jh-border">›</span>
          <span className="text-jh-border-mid">Revalidation</span>
        </div>

        <InstrumentPanel
          label={candidate ? "Intervention On Record" : "Create Intervention"}
          accent={candidate ? "ok" : undefined}
        >
          <InterventionClient
            key={experiment.workflow.interventions.length}
            diagnosis={diagnosis}
            baselineEvaluatorVersion={experiment.config.version}
            baselineRubricVersion={experiment.config.rubricVersion}
            baselineTaxonomyVersion="unscoped"
            currentRubricText={startingRubric}
            existingIntervention={intervention}
            revalidationDecision={null}
            previousAttemptCount={0}
            experimentId={experiment.id}
            showRevalidationLink
          />
        </InstrumentPanel>
      </div>
    </main>
  );
}

export default function InterventionPage() {
  const workspace = activeWorkspace();
  if (workspace.mode === "configured") {
    return <ExperimentIntervention experiment={workspace.experiment} />;
  }
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
            status={existingIntervention ? "ok" : "warning"}
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
            readOnly
          />
        </InstrumentPanel>

      </div>
    </main>
  );
}

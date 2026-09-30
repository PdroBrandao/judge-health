"use client";
// ============================================================
// InterventionClient — propose rubric changes and create candidate
//
// Receives the current (baseline) rubric text and diagnosis context.
// The analyst edits the proposed rubric and writes a rationale.
// On submit, calls actionCreateIntervention() (persists intervention)
// then actionCreateCandidate() which redirects to /revalidation.
// ============================================================
import { useState, useTransition } from "react";
import { actionCreateIntervention, actionCreateCandidate } from "@/app/actions/workflow";
import type { DiagnosisRecord, InterventionRecord } from "@/core/types";

interface Props {
  diagnosis: DiagnosisRecord;
  baselineEvaluatorVersion: string;
  baselineRubricVersion: string;
  currentRubricText: string;
  existingIntervention: InterventionRecord | null;
}

// ── Read-only view once intervention is created ───────────────
function InterventionReadOnly({ intervention }: { intervention: InterventionRecord }) {
  const statusColors = {
    draft: "text-jh-amber",
    candidate_created: "text-jh-green",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 border border-jh-green/40 bg-green-50/20 px-3 py-2 font-mono text-[10px] text-jh-green">
        <div className="w-2 h-2 rounded-full bg-jh-led-green shrink-0" />
        Intervention recorded — {new Date(intervention.createdAt).toLocaleString()}
      </div>

      <div className="border border-jh-border-lt bg-jh-bg/40 p-3 space-y-2 font-mono text-[10px]">
        <div className="flex gap-3">
          <span className="text-jh-dim w-32 shrink-0">Baseline</span>
          <span className="text-jh-text">{intervention.baselineEvaluatorVersion}</span>
        </div>
        <div className="flex gap-3">
          <span className="text-jh-dim w-32 shrink-0">Baseline Rubric</span>
          <span className="text-jh-text">{intervention.baselineRubricVersion}</span>
        </div>
        <div className="flex gap-3">
          <span className="text-jh-dim w-32 shrink-0">Status</span>
          <span className={statusColors[intervention.status]}>
            {intervention.status.replace("_", " ")}
          </span>
        </div>
        <div className="pt-2 border-t border-jh-border-lt">
          <span className="text-jh-dim block mb-1">Rationale</span>
          <p className="text-jh-text leading-relaxed whitespace-pre-wrap">{intervention.rationale}</p>
        </div>
        <div className="pt-2 border-t border-jh-border-lt">
          <span className="text-jh-dim block mb-2">Proposed Rubric Changes</span>
          <pre className="text-jh-text text-[10px] bg-jh-panel border border-jh-border-lt p-2 overflow-auto max-h-40 whitespace-pre-wrap leading-relaxed">
            {intervention.proposedRubricText}
          </pre>
        </div>
      </div>

      {intervention.status === "draft" && (
        <div className="border border-jh-amber/50 bg-amber-50/20 px-3 py-2 font-mono text-[10px] text-jh-amber">
          Intervention saved as draft. Navigate to Revalidation to continue.
        </div>
      )}
      {intervention.status === "candidate_created" && (
        <div className="border border-jh-green/40 bg-green-50/20 px-3 py-2 font-mono text-[10px] text-jh-green flex items-center justify-between gap-3">
          <span>Candidate created successfully.</span>
          <a
            href="/revalidation"
            className="font-mono text-[11px] border border-jh-green/70 px-3 py-1 hover:bg-green-50/40 transition-colors whitespace-nowrap"
          >
            View Revalidation →
          </a>
        </div>
      )}
    </div>
  );
}

// ── Main form ─────────────────────────────────────────────────
export function InterventionClient({
  diagnosis,
  baselineEvaluatorVersion,
  baselineRubricVersion,
  currentRubricText,
  existingIntervention,
}: Props) {
  const [proposedRubric, setProposedRubric] = useState(currentRubricText);
  const [rationale, setRationale]           = useState("");
  const [isPending, startTransition]        = useTransition();

  // If intervention already exists, show read-only view
  if (existingIntervention) {
    return <InterventionReadOnly intervention={existingIntervention} />;
  }

  const canSubmit = rationale.trim().length >= 10;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || isPending) return;

    startTransition(async () => {
      // 1. Persist the intervention
      await actionCreateIntervention({
        diagnosisId: diagnosis.id,
        baselineEvaluatorVersion,
        baselineRubricVersion,
        proposedRubricText: proposedRubric,
        rationale,
      });

      // 2. Create the candidate version from the intervention.
      //    actionCreateCandidate() calls redirect("/revalidation") — no return.
      const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      await actionCreateCandidate({
        version: `${baselineEvaluatorVersion}-candidate.${timestamp}`,
        rubricVersion: `${baselineRubricVersion}-proposed`,
        taxonomyVersion: "v1.0.0", // taxonomy unchanged in this intervention
        changeDescription: rationale.slice(0, 120),
      });
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* Diagnosis context */}
      <div className="border border-jh-border-lt bg-jh-bg/40 px-3 py-2 font-mono text-[10px]">
        <div className="text-jh-dim uppercase tracking-wide mb-2">Linked Diagnosis</div>
        <div className="flex gap-3 text-jh-text">
          <span className="text-jh-dim w-28">Category</span>
          <span>{diagnosis.category.replace("_", " ")}</span>
        </div>
        <div className="flex gap-3 mt-1 text-jh-text">
          <span className="text-jh-dim w-28">Trigger</span>
          <span>{diagnosis.triggerId}</span>
        </div>
        <div className="flex gap-3 mt-1 text-jh-text">
          <span className="text-jh-dim w-28">Observation</span>
          <span className="line-clamp-2 text-jh-dim italic">{diagnosis.observationNote}</span>
        </div>
      </div>

      {/* 01 — Proposed rubric changes */}
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-jh-dim mb-2">
          01 · Proposed Rubric Changes
        </div>
        <div className="font-mono text-[10px] text-jh-dim mb-2">
          Edit the rubric text below. Baseline:{" "}
          <span className="text-jh-text">{baselineRubricVersion}</span>
        </div>
        <textarea
          value={proposedRubric}
          onChange={(e) => setProposedRubric(e.target.value)}
          rows={8}
          className={[
            "w-full font-mono text-[11px] border bg-jh-bg/60 px-3 py-2 resize-none outline-none",
            "placeholder:text-jh-border-mid text-jh-text",
            "focus:border-jh-border-mid border-jh-border-lt",
          ].join(" ")}
        />
        <div className="font-mono text-[9px] text-jh-dim mt-1">
          These changes will be used to create the candidate evaluator version for revalidation.
        </div>
      </div>

      {/* 02 — Rationale */}
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-jh-dim mb-2">
          02 · Change Rationale <span className="normal-case">(min 10 chars)</span>
        </div>
        <textarea
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          placeholder="Explain why these rubric changes are expected to address the diagnosed issue..."
          rows={3}
          className={[
            "w-full font-mono text-[11px] border bg-jh-bg/60 px-3 py-2 resize-none outline-none",
            "placeholder:text-jh-border-mid text-jh-text",
            "focus:border-jh-border-mid border-jh-border-lt",
          ].join(" ")}
        />
        <div className="text-right font-mono text-[9px] text-jh-dim mt-1">
          {rationale.trim().length} chars
        </div>
      </div>

      {/* Submit */}
      <div className="flex items-center gap-3 pt-1 border-t border-jh-border-lt">
        <button
          type="submit"
          disabled={!canSubmit || isPending}
          className={[
            "font-mono text-[11px] px-4 py-2 border transition-colors",
            canSubmit && !isPending
              ? "border-jh-border text-jh-text hover:bg-jh-bg"
              : "border-jh-border-lt text-jh-dim cursor-not-allowed",
          ].join(" ")}
        >
          {isPending ? "Creating Candidate…" : "Create Candidate →"}
        </button>
        {!canSubmit && !isPending && (
          <span className="font-mono text-[10px] text-jh-dim">
            Write a rationale to continue.
          </span>
        )}
        <span className="font-mono text-[10px] text-jh-dim ml-auto">
          Will redirect to Revalidation
        </span>
      </div>
    </form>
  );
}

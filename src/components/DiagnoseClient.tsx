"use client";
// ============================================================
// DiagnoseClient — interactive diagnosis form
//
// Milestone 3: calls actionSubmitDiagnosis() server action.
// If existingDiagnosis is provided, shows read-only view +
// "Create Intervention →" link (if revalidation requested).
// ============================================================
import { useState, useTransition } from "react";
import type { DiagnosisCategory, DiagnosisRecord } from "@/core/types";
import { InstrumentPanel } from "@/components/instrument/InstrumentPanel";
import { StatusLED } from "@/components/instrument/StatusLED";
import { actionSubmitDiagnosis } from "@/app/actions/workflow";

interface Props {
  firedCount: number;
  firedTriggerIds: string[];
  evaluatorVersion: string;
  existingDiagnosis: DiagnosisRecord | null;
}

const CATEGORIES: { id: DiagnosisCategory; label: string; description: string }[] = [
  {
    id: "evaluator_rubric",
    label: "Evaluator / Rubric Issue",
    description:
      "The rubric is ambiguous, incomplete, or the evaluator prompt has a systematic flaw. Correction requires rubric update + revalidation.",
  },
  {
    id: "reference_process",
    label: "Reference Process Issue",
    description:
      "The human reference record contains errors, was produced under inconsistent conditions, or reviewer disagreement is unresolved.",
  },
  {
    id: "context_taxonomy",
    label: "Context / Taxonomy Gap",
    description:
      "Cases represent a distribution shift, an unlabelled category, or a concept not yet present in the taxonomy. Context mapping update needed.",
  },
  {
    id: "other",
    label: "Other / Under Investigation",
    description:
      "Root cause is unclear or does not fit the standard categories. Mark as under investigation and provide a working hypothesis below.",
  },
];

// ── Read-only submitted view ──────────────────────────────────
function DiagnosisReadOnly({ diagnosis, onReset }: {
  diagnosis: DiagnosisRecord;
  onReset: () => void;
}) {
  const catLabel = CATEGORIES.find((c) => c.id === diagnosis.category)?.label ?? diagnosis.category;
  const statusColors = {
    open: "text-jh-amber",
    intervention_created: "text-jh-green",
    resolved: "text-jh-dim",
  };

  return (
    <InstrumentPanel label="Diagnosis On Record" accent="ok">
      <div className="space-y-4 py-2">
        <div className="flex items-center gap-3">
          <StatusLED status="ok" size="lg" />
          <div>
            <div className="font-mono text-[12px] font-semibold text-jh-green">
              Diagnosis recorded
            </div>
            <div className="font-mono text-[10px] text-jh-dim">
              {new Date(diagnosis.createdAt).toLocaleString()}
            </div>
          </div>
        </div>

        <div className="border border-jh-border-lt bg-jh-bg/40 p-3 space-y-2 font-mono text-[10px]">
          <div className="flex gap-3">
            <span className="text-jh-dim w-28 shrink-0">Category</span>
            <span className="text-jh-text font-semibold">{catLabel}</span>
          </div>
          <div className="flex gap-3">
            <span className="text-jh-dim w-28 shrink-0">Evaluator</span>
            <span className="text-jh-text">{diagnosis.evaluatorVersion}</span>
          </div>
          <div className="flex gap-3">
            <span className="text-jh-dim w-28 shrink-0">Trigger</span>
            <span className="text-jh-text">{diagnosis.triggerId}</span>
          </div>
          <div className="flex gap-3">
            <span className="text-jh-dim w-28 shrink-0">Revalidation</span>
            <span className={diagnosis.revalidationRequested ? "text-jh-amber font-semibold" : "text-jh-dim"}>
              {diagnosis.revalidationRequested ? "REQUESTED" : "Not requested"}
            </span>
          </div>
          <div className="flex gap-3">
            <span className="text-jh-dim w-28 shrink-0">Status</span>
            <span className={statusColors[diagnosis.status]}>
              {diagnosis.status.replace("_", " ")}
            </span>
          </div>
          <div className="pt-2 border-t border-jh-border-lt">
            <span className="text-jh-dim block mb-1">Observation note</span>
            <p className="text-jh-text leading-relaxed whitespace-pre-wrap">{diagnosis.observationNote}</p>
          </div>
        </div>

        {/* Intervention / revalidation path */}
        {diagnosis.revalidationRequested && diagnosis.status === "open" && (
          <div className="border border-jh-amber/50 bg-amber-50/30 px-3 py-2 font-mono text-[10px] text-jh-amber flex items-center justify-between gap-3">
            <span>Revalidation required — create an intervention to propose rubric changes.</span>
            <a
              href="/intervention"
              className="font-mono text-[11px] border border-jh-amber/70 text-jh-amber px-3 py-1 hover:bg-amber-50/50 transition-colors whitespace-nowrap"
            >
              Create Intervention →
            </a>
          </div>
        )}
        {diagnosis.revalidationRequested && diagnosis.status === "intervention_created" && (
          <div className="border border-jh-green/50 bg-green-50/20 px-3 py-2 font-mono text-[10px] text-jh-green flex items-center justify-between gap-3">
            <span>Intervention created. Candidate ready for revalidation.</span>
            <a
              href="/revalidation"
              className="font-mono text-[11px] border border-jh-green/70 text-jh-green px-3 py-1 hover:bg-green-50/40 transition-colors whitespace-nowrap"
            >
              View Revalidation →
            </a>
          </div>
        )}
        {diagnosis.status === "resolved" && (
          <div className="border border-jh-border-lt bg-jh-bg/40 px-3 py-2 font-mono text-[10px] text-jh-dim">
            This diagnosis has been resolved via revalidation decision.
          </div>
        )}

        <button
          type="button"
          onClick={onReset}
          className="font-mono text-[10px] border border-jh-border text-jh-dim px-3 py-1.5 hover:bg-jh-bg transition-colors"
        >
          Start new diagnosis
        </button>
      </div>
    </InstrumentPanel>
  );
}

// ── Main component ─────────────────────────────────────────────
export function DiagnoseClient({
  firedCount,
  firedTriggerIds,
  evaluatorVersion,
  existingDiagnosis,
}: Props) {
  const [category, setCategory]         = useState<DiagnosisCategory | null>(null);
  const [note, setNote]                 = useState("");
  const [triggerRevalidation, setTriggerRevalidation] = useState(false);
  const [isPending, startTransition]    = useTransition();
  // Local override: if user clicks "Start new diagnosis", hide existing
  const [hideExisting, setHideExisting] = useState(false);

  const canSubmit = category !== null && note.trim().length >= 10;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || isPending) return;
    const triggerId = firedTriggerIds[0] ?? "manual";
    startTransition(async () => {
      await actionSubmitDiagnosis({
        triggerId,
        evaluatorVersion,
        category: category!,
        observationNote: note,
        revalidationRequested: triggerRevalidation,
      });
      // Server will revalidatePath; page re-renders with existingDiagnosis set
    });
  }

  // Show existing diagnosis if present (and user hasn't clicked override)
  if (existingDiagnosis && !hideExisting) {
    return (
      <DiagnosisReadOnly
        diagnosis={existingDiagnosis}
        onReset={() => setHideExisting(true)}
      />
    );
  }

  // Show form
  return (
    <InstrumentPanel
      label={`Diagnosis Form — ${firedCount} trigger${firedCount !== 1 ? "s" : ""} open`}
    >
      <form onSubmit={handleSubmit} className="space-y-5">

        {/* ── Category selector ── */}
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-jh-dim mb-3">
            01 · Root Cause Category
          </div>
          <div className="space-y-2">
            {CATEGORIES.map(({ id, label, description }) => (
              <label
                key={id}
                className={[
                  "flex gap-3 p-3 border cursor-pointer transition-colors",
                  category === id
                    ? "border-jh-border bg-jh-bg/70"
                    : "border-jh-border-lt hover:border-jh-border-mid",
                ].join(" ")}
              >
                <div className="mt-0.5 shrink-0">
                  <input
                    type="radio"
                    name="category"
                    value={id}
                    checked={category === id}
                    onChange={() => setCategory(id)}
                    className="accent-current"
                  />
                </div>
                <div>
                  <div className="font-mono text-[11px] font-semibold text-jh-text">{label}</div>
                  <div className="font-mono text-[10px] text-jh-dim mt-0.5 leading-relaxed">
                    {description}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* ── Observation note ── */}
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-jh-dim mb-2">
            02 · Observation Note <span className="normal-case">(min 10 chars)</span>
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Describe your findings, affected case patterns, and working hypothesis..."
            rows={4}
            className={[
              "w-full font-mono text-[11px] border bg-jh-bg/60 px-3 py-2 resize-none outline-none",
              "placeholder:text-jh-border-mid text-jh-text",
              "focus:border-jh-border-mid",
              "border-jh-border-lt",
            ].join(" ")}
          />
          <div className="text-right font-mono text-[9px] text-jh-dim mt-1">
            {note.trim().length} chars
          </div>
        </div>

        {/* ── Revalidation option ── */}
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-jh-dim mb-2">
            03 · Follow-Up Action
          </div>
          <label className="flex items-start gap-3 p-3 border border-jh-border-lt cursor-pointer hover:border-jh-border-mid transition-colors">
            <input
              type="checkbox"
              checked={triggerRevalidation}
              onChange={(e) => setTriggerRevalidation(e.target.checked)}
              className="mt-0.5"
            />
            <div>
              <div className="font-mono text-[11px] font-semibold text-jh-text">
                Trigger Revalidation Protocol
              </div>
              <div className="font-mono text-[10px] text-jh-dim mt-0.5">
                Creates a revalidation task with a candidate evaluator version.
                Required when the root cause involves a rubric change or evaluator update.
              </div>
            </div>
          </label>
        </div>

        {/* ── Submit ── */}
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
            {isPending ? "Recording…" : "Record Diagnosis"}
          </button>
          {!canSubmit && !isPending && (
            <span className="font-mono text-[10px] text-jh-dim">
              Select a category and write an observation note to continue.
            </span>
          )}
        </div>
      </form>
    </InstrumentPanel>
  );
}

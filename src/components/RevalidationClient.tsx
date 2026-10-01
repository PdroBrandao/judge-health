"use client";
// ============================================================
// RevalidationClient — accept / reject decision widget
//
// Milestone 3: calls actionRecordDecision() server action.
// If existingDecision is provided, shows read-only calibration result.
// ============================================================
import { useState, useTransition } from "react";
import { InstrumentPanel } from "@/components/instrument/InstrumentPanel";
import { StatusLED } from "@/components/instrument/StatusLED";
import { CalibrationSeal } from "@/components/instrument/CalibrationSeal";
import { actionRecordDecision } from "@/app/actions/workflow";
import type { RevalidationDecision } from "@/core/types";

interface Props {
  baselineVersion: string;
  candidateVersion: string;
  deltaFailRecall: number;
  existingDecision: RevalidationDecision | null;
  /** When true, both live baseline and live candidate runs are complete. */
  liveRunsComplete?: boolean;
  /** True if baseline metrics come from a live OpenAI run. */
  baselineIsLive?: boolean;
  /** True if candidate metrics come from a completed live candidate run. */
  candidateIsLive?: boolean;
}

type Decision = "accept" | "reject" | null;

function pct(v: number) {
  return (v * 100).toFixed(1) + "%";
}

// ── Read-only post-decision view ──────────────────────────────
function DecisionResult({ decision }: { decision: RevalidationDecision }) {
  const accepted = decision.decision === "accepted";
  return (
    <InstrumentPanel
      label="Calibration Result"
      accent={accepted ? "ok" : "error"}
    >
      <div className="space-y-4 py-2">
        <div className="flex items-center gap-4">
          <CalibrationSeal status={accepted ? "VALIDATED" : "REVALIDATION REQUIRED"} />
          <div>
            <div className="font-mono text-[11px] text-jh-dim">
              Candidate {accepted ? "accepted" : "rejected"} · {new Date(decision.decidedAt).toLocaleString()}
            </div>
            <div className="font-mono text-[10px] text-jh-dim mt-0.5">
              Calibration Run #0001
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusLED status={accepted ? "ok" : "error"} size="sm" />
          <span className={`font-mono text-[11px] font-bold ${accepted ? "text-jh-green" : "text-jh-red"}`}>
            {accepted
              ? "INSTRUMENT CALIBRATED — candidate promoted"
              : "CALIBRATION FAILED — baseline remains active"}
          </span>
        </div>

        <div className="border border-jh-border-lt bg-jh-bg/40 p-3 space-y-2 font-mono text-[10px]">
          <div className="flex gap-3">
            <span className="text-jh-dim w-28 shrink-0">Decision</span>
            <span className={`font-semibold ${accepted ? "text-jh-green" : "text-jh-red"}`}>
              {accepted ? "Accept" : "Reject"} candidate
            </span>
          </div>
          <div className="flex gap-3">
            <span className="text-jh-dim w-28 shrink-0">Baseline</span>
            <span className="text-jh-text">{decision.baselineVersion}</span>
          </div>
          <div className="flex gap-3">
            <span className="text-jh-dim w-28 shrink-0">Candidate</span>
            <span className="text-jh-text">{decision.candidateVersion}</span>
          </div>
          <div className="pt-2 border-t border-jh-border-lt">
            <span className="text-jh-dim block mb-1">Justification</span>
            <p className="text-jh-text leading-relaxed whitespace-pre-wrap">{decision.rationale}</p>
          </div>
        </div>

        {accepted && (
          <div className="border border-jh-green/40 bg-green-50/20 px-3 py-2 font-mono text-[10px] text-jh-green">
            Candidate {decision.candidateVersion} accepted and marked as <span className="font-semibold">active</span>.{" "}
            {decision.baselineVersion} superseded. Workflow complete.
          </div>
        )}
        {!accepted && (
          <div className="border border-jh-red/40 bg-red-50/20 px-3 py-2 font-mono text-[10px] text-jh-red">
            Candidate rejected. {decision.baselineVersion} remains active. Create a new intervention to try again.
          </div>
        )}
      </div>
    </InstrumentPanel>
  );
}

// ── Main component ─────────────────────────────────────────────
export function RevalidationClient({
  baselineVersion,
  candidateVersion,
  deltaFailRecall,
  existingDecision,
  liveRunsComplete,
  baselineIsLive,
  candidateIsLive,
}: Props) {
  const [decision, setDecision]    = useState<Decision>(null);
  const [note, setNote]            = useState("");
  const [isPending, startTransition] = useTransition();
  const [localDecision, setLocalDecision] = useState<RevalidationDecision | null>(existingDecision);

  // Show existing decision if already recorded
  if (localDecision) {
    return <DecisionResult decision={localDecision} />;
  }

  const canSubmit = decision !== null && note.trim().length >= 10;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || isPending) return;

    startTransition(async () => {
      await actionRecordDecision({
        candidateVersion,
        baselineVersion,
        decision: decision === "accept" ? "accepted" : "rejected",
        rationale: note,
      });
      // Optimistically show result
      setLocalDecision({
        id: "optimistic",
        candidateVersion,
        baselineVersion,
        decision: decision === "accept" ? "accepted" : "rejected",
        rationale: note,
        decidedAt: new Date().toISOString(),
      });
    });
  }

  // ── Decision form ──────────────────────────────────────────
  const sign = (v: number) => (v >= 0 ? "+" : "");
  const isImprovement = deltaFailRecall > 0.005;
  const isRegression  = deltaFailRecall < -0.005;

  // Gate: Accept/Reject only enabled when we have a completed live candidate run.
  // In baseline-live mode this is mandatory — no fixture fallback allowed.
  const isLiveGated = baselineIsLive && !candidateIsLive;

  // Live-gated: show info panel instead of form
  if (isLiveGated) {
    return (
      <InstrumentPanel label="Analyst Decision">
        <div className="space-y-3 py-2">
          <div className="flex items-center gap-3 border border-jh-amber/50 bg-amber-50/20 px-3 py-2 font-mono text-[10px] text-jh-amber">
            <div className="w-2 h-2 rounded-full bg-jh-led-amber shrink-0" />
            <span>
              <span className="font-semibold">LIVE MODE — </span>
              Accept/Reject requires a completed Live Revalidation run.
              Run Live Revalidation above to evaluate the candidate rubric with OpenAI.
            </span>
          </div>
          <div className="font-mono text-[10px] text-jh-dim border border-jh-border-lt px-3 py-2">
            No performance claim may be made until the candidate has been evaluated.
            Candidate metrics will populate after the run completes.
          </div>
        </div>
      </InstrumentPanel>
    );
  }

  return (
    <InstrumentPanel label="Analyst Decision">
      <div className="space-y-5">

        {/* Context hint */}
        <div className={[
          "px-3 py-2 border font-mono text-[10px] leading-relaxed",
          isImprovement ? "border-jh-green/40 text-jh-green bg-green-50/20" :
          isRegression  ? "border-jh-red/40 text-jh-red bg-red-50/20" :
                          "border-jh-border-lt text-jh-dim bg-jh-bg/40",
        ].join(" ")}>
          FAIL Recall delta: <span className="font-bold">{sign(deltaFailRecall)}{pct(deltaFailRecall)}</span>
          {isImprovement && " — Candidate improves on the primary safety metric."}
          {isRegression  && " — Candidate regresses on the primary safety metric. Rejection recommended."}
          {!isImprovement && !isRegression && " — No meaningful change on primary safety metric."}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Accept / Reject buttons */}
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-jh-dim mb-3">
              01 · Decision
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDecision("accept")}
                className={[
                  "flex-1 border py-3 font-mono text-[11px] font-semibold transition-colors",
                  decision === "accept"
                    ? "border-jh-green text-jh-green bg-green-50/30"
                    : "border-jh-border-lt text-jh-dim hover:border-jh-border-mid",
                ].join(" ")}
              >
                ✓ Accept Candidate
              </button>
              <button
                type="button"
                onClick={() => setDecision("reject")}
                className={[
                  "flex-1 border py-3 font-mono text-[11px] font-semibold transition-colors",
                  decision === "reject"
                    ? "border-jh-red text-jh-red bg-red-50/20"
                    : "border-jh-border-lt text-jh-dim hover:border-jh-border-mid",
                ].join(" ")}
              >
                ✕ Reject Candidate
              </button>
            </div>
          </div>

          {/* Justification note */}
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-jh-dim mb-2">
              02 · Justification <span className="normal-case">(required, min 10 chars)</span>
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Explain your rationale for the accept/reject decision, referencing specific metrics or case patterns..."
              rows={4}
              className={[
                "w-full font-mono text-[11px] border bg-jh-bg/60 px-3 py-2 resize-none outline-none",
                "placeholder:text-jh-border-mid text-jh-text",
                "focus:border-jh-border-mid border-jh-border-lt",
              ].join(" ")}
            />
            <div className="text-right font-mono text-[9px] text-jh-dim mt-1">
              {note.trim().length} chars
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
                  ? decision === "accept"
                    ? "border-jh-green text-jh-green hover:bg-green-50/30"
                    : "border-jh-red text-jh-red hover:bg-red-50/20"
                  : "border-jh-border-lt text-jh-dim cursor-not-allowed",
              ].join(" ")}
            >
              {isPending
                ? "Recording…"
                : decision === "accept"
                ? "Confirm Accept"
                : decision === "reject"
                ? "Confirm Reject"
                : "Record Decision"}
            </button>
            {!canSubmit && !isPending && (
              <span className="font-mono text-[10px] text-jh-dim">
                Select a decision and write a justification to continue.
              </span>
            )}
          </div>
        </form>
      </div>
    </InstrumentPanel>
  );
}

"use client";
// ============================================================
// CaseDetail — interactive case detail with blind review
//
// Stage machine:
//   "observe"  → full case visible (evaluator + human reference)
//   "blind"    → labels hidden, user gives their review
//   "revealed" → three records side-by-side:
//                  Fixture Reference | Your Blind Review | Evaluator Judgment
//
// Milestone 3: blind review is persisted via actionSubmitBlindReview().
// If existingBlindReview is provided, skip straight to "revealed".
// ============================================================
import { useState, useTransition } from "react";
import type { CaseDetailData, Label, BlindHumanReview } from "@/core/types";
import { actionSubmitBlindReview } from "@/app/actions/workflow";

// ── Helpers ───────────────────────────────────────────────────
const RESULT_LABELS = {
  TP: { text: "TP — Correct FAIL",   color: "text-jh-green",  bg: "bg-green-50/60" },
  TN: { text: "TN — Correct PASS",   color: "text-jh-dim",    bg: "" },
  FP: { text: "FP — False Alarm",    color: "text-jh-amber",  bg: "bg-amber-50/40" },
  FN: { text: "FN — MISSED FAIL ←",  color: "text-jh-red",    bg: "bg-red-50/60" },
} as const;

function LabelChip({ label }: { label: Label }) {
  return (
    <span
      className={`inline-block font-mono font-bold text-xs px-2 py-0.5 border ${
        label === "FAIL"
          ? "border-jh-red text-jh-red"
          : "border-jh-green text-jh-green"
      }`}
    >
      {label}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-jh-dim border-b border-jh-border-lt pb-1 mb-2">
        {title}
      </div>
      {children}
    </div>
  );
}

// ── Three-column comparison in revealed stage ─────────────────
function ComparisonTable({
  data,
  blindReview,
}: {
  data: CaseDetailData;
  blindReview: BlindHumanReview;
}) {
  const { groundTruth, evaluatorLabel, humanReference } = data;
  const userLabel    = blindReview.label;
  const userRationale = blindReview.rationale;

  const userMatchesEvaluator = userLabel === evaluatorLabel;
  const userMatchesHuman     = humanReference ? userLabel === humanReference.label : null;
  const evaluatorMissed      = data.result === "FN";
  const userAlsoMissed       = userLabel === "PASS" && groundTruth === "FAIL";
  const userCaughtIt         = userLabel === "FAIL" && groundTruth === "FAIL" && evaluatorMissed;

  let narrative = "";
  if (userAlsoMissed && evaluatorMissed) {
    narrative =
      "You and the evaluator both missed this FAIL. This is exactly the correlated-error pattern Judge Health is designed to detect — when reviewer and evaluator share similar reasoning patterns, systematic gaps can go unnoticed.";
  } else if (userCaughtIt) {
    narrative =
      "You caught what the evaluator missed. This is the value of independent human reference review — a reviewer without the evaluator's bias can surface failures the system consistently overlooks.";
  } else if (data.result === "FP" && userLabel === "PASS") {
    narrative =
      "You agree with the human reference: this is a PASS. The evaluator raised a false alarm. False alarms reduce trust in the evaluator and create unnecessary investigation workload.";
  } else if (data.result === "FP" && userLabel === "FAIL") {
    narrative =
      "You agreed with the evaluator's false alarm. The human reference rated this as PASS. This may indicate the rubric boundary for this case type needs clarification.";
  } else {
    narrative = "Review recorded. Comparing your judgment with the evaluator and human reference reveals the inter-rater dynamics in this evaluation context.";
  }

  return (
    <div className="space-y-4">
      {/* Your submitted review */}
      <div className="jh-panel-deep p-3 bg-jh-panel border border-jh-border-lt">
        <div className="font-mono text-[10px] text-jh-dim uppercase tracking-wide mb-2">
          Your Blind Review — {blindReview.reviewerAlias} · {new Date(blindReview.submittedAt).toLocaleTimeString()}
        </div>
        <div className="flex items-start gap-3">
          <LabelChip label={userLabel} />
          {userRationale && (
            <p className="text-sm text-jh-dim leading-relaxed flex-1 italic">
              &ldquo;{userRationale}&rdquo;
            </p>
          )}
        </div>
      </div>

      {/* Three-column comparison */}
      <div>
        <div className="font-mono text-[10px] text-jh-dim uppercase tracking-wide border-b border-jh-border-lt pb-1 mb-2">
          Side-by-Side Comparison
        </div>
        <div className="grid grid-cols-4 gap-2 text-center text-[11px] font-mono">
          {[
            {
              label: "Your Review",
              value: userLabel,
              sub: blindReview.reviewerAlias,
            },
            {
              label: "Evaluator",
              value: evaluatorLabel,
              sub: data.evaluatorVersion,
            },
            {
              label: "Fixture Reference",
              value: humanReference?.label ?? "—",
              sub: humanReference ? humanReference.reviewerAlias : "no record",
            },
            {
              label: "Ground Truth",
              value: groundTruth,
              sub: "fixture",
            },
          ].map(({ label: colLabel, value, sub }) => (
            <div key={colLabel} className="border border-jh-border-lt p-2">
              <div className="text-jh-dim text-[9px] mb-1 leading-tight">{colLabel}</div>
              {value !== "—" ? (
                <LabelChip label={value as Label} />
              ) : (
                <span className="text-jh-dim">—</span>
              )}
              <div className="text-jh-dim text-[9px] mt-1 truncate">{sub}</div>
            </div>
          ))}
        </div>

        {/* Agreement lines */}
        <div className="mt-2 font-mono text-[10px] text-jh-dim space-y-0.5">
          <div>
            You vs Evaluator:{" "}
            <span className={userMatchesEvaluator ? "text-jh-green" : "text-jh-amber"}>
              {userMatchesEvaluator ? "agree" : "disagree"}
            </span>
          </div>
          {userMatchesHuman !== null && (
            <div>
              You vs Fixture Reference:{" "}
              <span className={userMatchesHuman ? "text-jh-green" : "text-jh-amber"}>
                {userMatchesHuman ? "agree" : "disagree"}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Narrative */}
      <div className="border-l-2 border-jh-border pl-3 py-1">
        <p className="text-[11px] text-jh-dim leading-relaxed italic">{narrative}</p>
      </div>

      {/* Diagnose link */}
      <div className="pt-2 border-t border-jh-border-lt">
        <a
          href="/diagnose"
          className="font-mono text-[11px] border border-jh-border px-3 py-1.5 hover:bg-jh-bg transition-colors inline-block"
        >
          Diagnose →
        </a>
        <span className="font-mono text-[10px] text-jh-dim ml-3">
          Record diagnosis: evaluator/rubric · reference process · context/taxonomy · unresolved
        </span>
      </div>
    </div>
  );
}

// ── Stage indicator with LEDs ─────────────────────────────────
const STAGES = [
  { key: "observe",  label: "Observe" },
  { key: "blind",    label: "Blind Review" },
  { key: "revealed", label: "Revealed" },
] as const;

function StageIndicator({ current }: { current: "observe" | "blind" | "revealed" }) {
  const order = { observe: 0, blind: 1, revealed: 2 };
  const idx   = order[current];

  return (
    <div className="flex items-center gap-0 font-mono text-[10px]">
      {STAGES.map((s, i) => {
        const done    = i < idx;
        const active  = i === idx;
        return (
          <div key={s.key} className="flex items-center gap-2">
            {i > 0 && (
              <div className={`h-px w-8 ${done ? "bg-jh-border" : "bg-jh-border-lt"}`} />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={[
                  "w-2.5 h-2.5 rounded-full flex-shrink-0",
                  active ? "bg-jh-led-amber shadow-[0_0_5px_var(--jh-led-amber)]" :
                  done   ? "bg-jh-led-green shadow-[0_0_4px_var(--jh-led-green)]" :
                           "bg-jh-border-lt",
                ].join(" ")}
              />
              <span className={active ? "text-jh-text" : done ? "text-jh-dim" : "text-jh-border-lt"}>
                {s.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────
interface CaseDetailProps {
  data: CaseDetailData;
  existingBlindReview?: BlindHumanReview;
}

// ── Main component ─────────────────────────────────────────────
export function CaseDetail({ data, existingBlindReview }: CaseDetailProps) {
  const initialStage = existingBlindReview ? "revealed" : "observe";
  const [stage, setStage]           = useState<"observe" | "blind" | "revealed">(initialStage);
  const [userLabel, setUserLabel]   = useState<Label | null>(null);
  const [userRationale, setRationale] = useState("");
  const [submittedReview, setSubmittedReview] = useState<BlindHumanReview | undefined>(existingBlindReview);
  const [isPending, startTransition] = useTransition();

  const resultStyle = RESULT_LABELS[data.result];
  const { content, humanReference } = data;

  async function handleSubmitReview() {
    if (!userLabel) return;
    const reviewData = {
      caseId: data.caseId,
      reviewerAlias: "reviewer-A", // phase 1: fixed alias, no auth
      label: userLabel,
      rationale: userRationale,
    };
    startTransition(async () => {
      await actionSubmitBlindReview(reviewData);
      // Optimistic update — show the review immediately
      setSubmittedReview({
        id: "optimistic",
        ...reviewData,
        submittedAt: new Date().toISOString(),
      });
      setStage("revealed");
    });
  }

  const displayReview = submittedReview;

  return (
    <div className="space-y-4">

      {/* Stage indicator */}
      <div className="flex items-center justify-between border-b border-jh-border-lt pb-2">
        <StageIndicator current={stage} />
        <span className="font-mono text-[9px] text-jh-dim uppercase tracking-wide">
          Blind Review Protocol
        </span>
      </div>

      {/* Result badge */}
      <div className={`flex items-center gap-3 jh-panel-deep px-3 py-2 ${resultStyle.bg}`}>
        <span className={`font-mono font-bold text-sm ${resultStyle.color}`}>
          {resultStyle.text}
        </span>
        <span className="font-mono text-[10px] text-jh-dim">
          case {data.caseId} · {data.sampleType === "representative" ? "representative sample" : "targeted/risk"}
        </span>
        {stage === "observe" && (
          <button
            onClick={() => setStage("blind")}
            className="ml-auto font-mono text-[11px] border border-jh-border px-3 py-1 hover:bg-jh-bg transition-colors"
          >
            Review as Reference →
          </button>
        )}
        {stage === "revealed" && displayReview && (
          <span className="ml-auto font-mono text-[10px] text-jh-led-green">
            ● review saved
          </span>
        )}
      </div>

      {/* Input */}
      <Section title="Input / Context">
        <div className="border border-jh-border-lt bg-jh-panel p-3">
          <p className="text-sm text-jh-text leading-relaxed font-sans">
            {content.input}
          </p>
        </div>
      </Section>

      {/* System output */}
      <Section title="System Output (AI Response)">
        <div className="border border-jh-border-lt bg-jh-panel p-3">
          <p className="text-sm text-jh-text leading-relaxed font-sans">
            {content.systemOutput}
          </p>
        </div>
      </Section>

      {/* ── BLIND REVIEW STAGE ── */}
      {stage === "blind" && (
        <div className="jh-panel-deep p-4 bg-jh-panel">
          <div className="font-mono text-[10px] text-jh-dim uppercase tracking-wide mb-3">
            Your Review — evaluator and fixture reference labels hidden
          </div>
          <p className="text-[11px] text-jh-dim mb-4 font-mono">
            Based only on the input and system output above, classify this response.
          </p>

          <div className="flex gap-3 mb-4">
            {(["PASS", "FAIL"] as Label[]).map((l) => (
              <button
                key={l}
                onClick={() => setUserLabel(l)}
                className={`font-mono font-bold text-sm px-6 py-2 border-2 transition-colors ${
                  userLabel === l
                    ? l === "FAIL"
                      ? "border-jh-red bg-red-50 text-jh-red"
                      : "border-jh-green bg-green-50 text-jh-green"
                    : "border-jh-border-lt text-jh-dim hover:border-jh-border"
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          <textarea
            value={userRationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder="Optional: explain your reasoning..."
            rows={3}
            className="w-full border border-jh-border-lt p-2 text-sm font-sans text-jh-text bg-jh-bg resize-none outline-none focus:border-jh-border transition-colors placeholder:text-jh-border-mid"
          />

          <div className="flex gap-3 mt-3">
            <button
              disabled={!userLabel || isPending}
              onClick={handleSubmitReview}
              className="font-mono text-[11px] border border-jh-border px-4 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-jh-bg transition-colors"
            >
              {isPending ? "Saving…" : "Submit and Reveal →"}
            </button>
            <button
              onClick={() => { setStage("observe"); setUserLabel(null); setRationale(""); }}
              className="font-mono text-[11px] text-jh-dim hover:text-jh-text transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── REVEALED + OBSERVE STAGES — judgments ── */}
      {stage !== "blind" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

          {/* Evaluator judgment */}
          <div className="jh-panel-deep bg-jh-panel p-3">
            <div className="font-mono text-[10px] text-jh-dim uppercase tracking-wide mb-2 flex items-center justify-between">
              <span>Evaluator</span>
              <span className="font-normal">{data.evaluatorVersion}</span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <LabelChip label={data.evaluatorLabel} />
              {data.result === "FN" && (
                <span className="font-mono text-[10px] text-jh-red">← missed</span>
              )}
              {data.result === "FP" && (
                <span className="font-mono text-[10px] text-jh-amber">← false alarm</span>
              )}
            </div>
            {content.evaluatorRationale && (
              <p className="text-[11px] text-jh-dim leading-relaxed italic border-t border-jh-border-lt pt-2 mt-2">
                &ldquo;{content.evaluatorRationale}&rdquo;
              </p>
            )}
          </div>

          {/* Fixture reference */}
          <div className="jh-panel-deep bg-jh-panel p-3">
            <div className="font-mono text-[10px] text-jh-dim uppercase tracking-wide mb-2 flex items-center justify-between">
              <span>Fixture Reference</span>
              {humanReference && (
                <span className="font-normal">{humanReference.reviewerAlias}</span>
              )}
            </div>
            {humanReference ? (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <LabelChip label={humanReference.label} />
                  <span className="font-mono text-[10px] text-jh-dim">
                    {humanReference.reviewedAt}
                  </span>
                </div>
                <p className="text-[11px] text-jh-dim leading-relaxed italic border-t border-jh-border-lt pt-2 mt-2">
                  &ldquo;{humanReference.rationale}&rdquo;
                </p>
              </>
            ) : (
              <p className="text-[11px] text-jh-dim italic">No fixture reference for this case.</p>
            )}
          </div>
        </div>
      )}

      {/* ── REVEALED STAGE — full three-way comparison ── */}
      {stage === "revealed" && displayReview && (
        <ComparisonTable data={data} blindReview={displayReview} />
      )}

      {/* Observe: ground truth + diagnose link */}
      {stage === "observe" && (
        <div className="flex items-center gap-4 pt-2 border-t border-jh-border-lt">
          <div className="font-mono text-[10px] text-jh-dim">
            Ground truth:{" "}
            <span className={data.groundTruth === "FAIL" ? "text-jh-red font-semibold" : "text-jh-green font-semibold"}>
              {data.groundTruth}
            </span>
            <span className="text-jh-dim ml-2 font-normal">(fixture reference label — not production ground truth)</span>
          </div>
          <a
            href="/diagnose"
            className="ml-auto font-mono text-[11px] border border-jh-border-lt px-3 py-1 hover:border-jh-border hover:bg-jh-bg transition-colors whitespace-nowrap"
          >
            Diagnose →
          </a>
        </div>
      )}
    </div>
  );
}

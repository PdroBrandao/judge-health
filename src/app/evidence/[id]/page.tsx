// ============================================================
// /evidence/[id] — Case Detail
//
// Server component: fetches case data, passes to CaseDetail
// client component for interactive blind review.
//
// Revalidation context: when ?from=revalidation is present, shows
// a side-by-side Baseline | Current Candidate | Reference panel
// above the normal detail view. This is display-only — no data is
// mutated, no runs are changed.
// ============================================================
import { notFound } from "next/navigation";
import Link from "next/link";
import { FixtureRepository } from "@/data/fixture-repository";
import { WorkflowStore } from "@/data/workflow-store";
import { RunStore } from "@/data/run-store";
import { InstrumentPanel } from "@/components/instrument/InstrumentPanel";
import { StatusLED } from "@/components/instrument/StatusLED";
import { CaseDetail } from "@/components/CaseDetail";
import type { CaseResult, Label } from "@/core/types";

export default async function CaseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id }   = await params;
  const { from } = await searchParams;
  const fromRevalidation = from === "revalidation";

  const activeVersion = FixtureRepository.getActiveEvaluatorVersion();
  let detail = FixtureRepository.getCaseDetail(id, activeVersion.version);

  if (!detail) notFound();

  // ── Override evaluatorLabel / result with live baseline judgment if available ──
  const liveBaselineRunId = WorkflowStore.getBaselineRunId();
  const liveBaselineRun   = liveBaselineRunId ? RunStore.getRun(liveBaselineRunId) : RunStore.getBaselineRun();
  const isLive  = liveBaselineRun?.mode === "live" &&
    (liveBaselineRun.status === "completed" || liveBaselineRun.status === "partial_failure");

  if (isLive && liveBaselineRun) {
    // Use LiveJudgment directly (not converted) to preserve rationale
    const liveJudgment = liveBaselineRun.judgments.find((j) => j.caseId === id);
    if (liveJudgment) {
      const liveLabel = liveJudgment.label as Label;
      const result: CaseResult =
        detail.groundTruth === "FAIL" && liveLabel === "FAIL" ? "TP"
        : detail.groundTruth === "PASS" && liveLabel === "PASS" ? "TN"
        : detail.groundTruth === "FAIL" && liveLabel === "PASS" ? "FN"
        : "FP";
      detail = {
        ...detail,
        evaluatorLabel: liveLabel,
        evaluatorVersion: liveBaselineRun.evaluatorVersion,
        result,
        content: {
          ...detail.content,
          // Replace fixture rationale with the actual LLM rationale
          evaluatorRationale: liveJudgment.rationale,
        },
      };
    }
  }

  // ── Revalidation context ──────────────────────────────────────
  // Only built when the user arrives from the Revalidation page.
  // Looks up both baseline and candidate judgments by their stored
  // run IDs — never by "most recent by type" — to ensure Candidate #2
  // can never accidentally show Candidate #1's results.
  type RevalidationContext = {
    baselineVersion: string;
    candidateVersion: string;
    candidateRunId: string;
    baselineLabel: Label | null;
    baselineRationale: string | null;
    candidateLabel: Label | null;
    candidateRationale: string | null;
  };

  let revalidationContext: RevalidationContext | null = null;

  if (fromRevalidation) {
    const currentCandidate = WorkflowStore.getCurrentCandidate();
    const baselineRunId    = WorkflowStore.getBaselineRunId();
    const candidateRunId   = WorkflowStore.getCurrentCandidateRunId();

    const baselineRun  = baselineRunId  ? RunStore.getRun(baselineRunId)  : undefined;
    const candidateRun = candidateRunId ? RunStore.getRun(candidateRunId) : undefined;

    const baselineJudgment  = baselineRun?.judgments.find((j) => j.caseId === id);
    const candidateJudgment = candidateRun?.judgments.find((j) => j.caseId === id);

    if (currentCandidate) {
      revalidationContext = {
        baselineVersion:    baselineRun?.evaluatorVersion ?? activeVersion.version,
        candidateVersion:   currentCandidate.evaluatorVersion,
        candidateRunId:     candidateRun?.runId ?? "—",
        baselineLabel:      (baselineJudgment?.label as Label) ?? null,
        baselineRationale:  baselineJudgment?.rationale ?? null,
        candidateLabel:     (candidateJudgment?.label as Label) ?? null,
        candidateRationale: candidateJudgment?.rationale ?? null,
      };
    }
  }

  const existingBlindReview = WorkflowStore.getBlindReview(id);

  const resultLabels = {
    TP: "TP — Correct FAIL",
    TN: "TN — Correct PASS",
    FP: "FP — False Alarm",
    FN: "FN — MISSED FAIL",
  };

  // Helper: derive comparison result for the revalidation panel
  function revalResult(label: Label | null): string {
    if (!label) return "—";
    if (detail!.groundTruth === "FAIL" && label === "FAIL") return "TP";
    if (detail!.groundTruth === "PASS" && label === "PASS") return "TN";
    if (detail!.groundTruth === "FAIL" && label === "PASS") return "FN ⚠";
    return "FP";
  }

  return (
    <main className="min-h-screen bg-jh-bg p-3 lg:p-4">
      <div className="max-w-[860px] mx-auto">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-jh-border-lt font-mono text-[11px]">
          {fromRevalidation ? (
            <>
              <Link href="/revalidation" className="text-jh-dim hover:text-jh-text transition-colors">
                Revalidation
              </Link>
              <span className="text-jh-border-lt">›</span>
              <span className="text-jh-text">{id}</span>
            </>
          ) : (
            <>
              <Link href="/evidence" className="text-jh-dim hover:text-jh-text transition-colors">
                Evidence
              </Link>
              <span className="text-jh-border-lt">›</span>
              <span className="text-jh-text">{id}</span>
            </>
          )}
        </div>

        {/* ── Revalidation evidence panel ───────────────────────── */}
        {revalidationContext && (
          <div className="mb-4">
            <InstrumentPanel label={`Revalidation Evidence — ${id} — Attempt #${WorkflowStore.getCurrentCandidate()?.attemptNumber ?? "?"}`}>

              {/* Three-column judgment comparison */}
              <div className="grid grid-cols-3 divide-x divide-jh-border-lt">

                {/* Baseline */}
                <div className="px-4 py-3 space-y-2">
                  <div className="font-mono text-[9px] text-jh-dim uppercase tracking-[0.14em]">
                    Baseline
                  </div>
                  <div className="font-mono text-[10px] text-jh-dim">
                    {revalidationContext.baselineVersion}
                  </div>
                  {revalidationContext.baselineLabel ? (
                    <>
                      <div className="flex items-center gap-2">
                        <span className={`font-mono font-bold text-sm border px-2 py-0.5 ${
                          revalidationContext.baselineLabel === "FAIL"
                            ? "border-jh-red text-jh-red"
                            : "border-jh-green text-jh-green"
                        }`}>
                          {revalidationContext.baselineLabel}
                        </span>
                        <span className="font-mono text-[9px] text-jh-dim">
                          {revalResult(revalidationContext.baselineLabel)}
                        </span>
                      </div>
                      {revalidationContext.baselineRationale && (
                        <p className="font-mono text-[10px] text-jh-dim leading-relaxed italic border-t border-jh-border-lt pt-2">
                          &ldquo;{revalidationContext.baselineRationale}&rdquo;
                        </p>
                      )}
                    </>
                  ) : (
                    <span className="font-mono text-[10px] text-jh-dim italic">No live baseline judgment</span>
                  )}
                </div>

                {/* Current Candidate */}
                <div className="px-4 py-3 space-y-2">
                  <div className="font-mono text-[9px] text-jh-dim uppercase tracking-[0.14em]">
                    Current Candidate
                  </div>
                  <div className="font-mono text-[10px] text-jh-dim">
                    {revalidationContext.candidateVersion}
                  </div>
                  {revalidationContext.candidateLabel ? (
                    <>
                      <div className="flex items-center gap-2">
                        <span className={`font-mono font-bold text-sm border px-2 py-0.5 ${
                          revalidationContext.candidateLabel === "FAIL"
                            ? "border-jh-red text-jh-red"
                            : "border-jh-green text-jh-green"
                        }`}>
                          {revalidationContext.candidateLabel}
                        </span>
                        <span className="font-mono text-[9px] text-jh-dim">
                          {revalResult(revalidationContext.candidateLabel)}
                        </span>
                        {/* Delta indicator */}
                        {revalidationContext.baselineLabel &&
                         revalidationContext.candidateLabel !== revalidationContext.baselineLabel && (
                          <span className={`font-mono text-[9px] font-semibold ${
                            detail.groundTruth === "FAIL" && revalidationContext.candidateLabel === "FAIL"
                              ? "text-jh-green"   // fixed a miss
                              : detail.groundTruth === "FAIL" && revalidationContext.candidateLabel === "PASS"
                              ? "text-jh-red"     // new miss
                              : "text-jh-amber"   // changed
                          }`}>
                            {detail.groundTruth === "FAIL" && revalidationContext.candidateLabel === "FAIL"
                              ? "✓ miss fixed"
                              : detail.groundTruth === "FAIL" && revalidationContext.candidateLabel === "PASS"
                              ? "⚠ new miss"
                              : "changed"}
                          </span>
                        )}
                      </div>
                      {revalidationContext.candidateRationale && (
                        <p className="font-mono text-[10px] text-jh-dim leading-relaxed italic border-t border-jh-border-lt pt-2">
                          &ldquo;{revalidationContext.candidateRationale}&rdquo;
                        </p>
                      )}
                    </>
                  ) : (
                    <span className="font-mono text-[10px] text-jh-dim italic">Candidate run not yet completed</span>
                  )}
                  <div className="font-mono text-[9px] text-jh-dim border-t border-jh-border-lt pt-1">
                    Run: {revalidationContext.candidateRunId}
                  </div>
                </div>

                {/* Reference */}
                <div className="px-4 py-3 space-y-2">
                  <div className="font-mono text-[9px] text-jh-dim uppercase tracking-[0.14em]">
                    Fixture Reference
                  </div>
                  <div className={`font-mono font-bold text-sm border px-2 py-0.5 inline-block ${
                    detail.groundTruth === "FAIL"
                      ? "border-jh-red text-jh-red"
                      : "border-jh-green text-jh-green"
                  }`}>
                    {detail.groundTruth}
                  </div>
                  {detail.humanReference && (
                    <p className="font-mono text-[10px] text-jh-dim leading-relaxed italic border-t border-jh-border-lt pt-2">
                      &ldquo;{detail.humanReference.rationale}&rdquo;
                    </p>
                  )}
                  <div className="font-mono text-[9px] text-jh-dim">
                    Ground truth (fixture)
                  </div>
                </div>

              </div>

              {/* Footer: LED summary + back link */}
              <div className="border-t border-jh-border-lt px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-3 font-mono text-[10px] text-jh-dim">
                  <StatusLED
                    status={
                      revalidationContext.candidateLabel === null
                        ? "warning"
                        : revalidationContext.candidateLabel === detail.groundTruth
                        ? "ok"
                        : "error"
                    }
                    size="sm"
                  />
                  <span>
                    Candidate:{" "}
                    {revalidationContext.candidateLabel === null
                      ? "not evaluated"
                      : revalidationContext.candidateLabel === detail.groundTruth
                      ? "correct"
                      : "incorrect"}
                  </span>
                  {revalidationContext.baselineLabel !== null &&
                   revalidationContext.candidateLabel !== null &&
                   revalidationContext.baselineLabel !== revalidationContext.candidateLabel && (
                    <span className="text-jh-amber">· differs from baseline</span>
                  )}
                </div>
                <Link
                  href="/revalidation"
                  className="font-mono text-[10px] text-jh-dim hover:text-jh-text transition-colors"
                >
                  ← Back to Revalidation
                </Link>
              </div>

            </InstrumentPanel>
          </div>
        )}

        {/* ── Standard case detail (blind review flow) ───────────── */}
        <InstrumentPanel
          label={`Case Detail — ${id} — ${resultLabels[detail.result]}`}
        >
          <CaseDetail data={detail} existingBlindReview={existingBlindReview} />
        </InstrumentPanel>

        {/* Note */}
        <div className="mt-3 font-mono text-[10px] text-jh-dim border border-jh-border-lt px-3 py-2 bg-jh-panel">
          <span className="font-semibold text-jh-text">Note: </span>
          Human reference labels in this fixture are demonstration data and do not represent production human review.
          &ldquo;Human reference&rdquo; is never called &ldquo;ground truth&rdquo; — it is evidence from a review process
          that itself has quality characteristics (IRR, calibration, reviewer consistency).
        </div>

        <footer className="mt-4 pt-3 border-t border-jh-border-lt text-center">
          <span className="font-mono text-[10px] text-jh-dim">
            JUDGE HEALTH v0.2 · AACI Framework · Milestone 2
          </span>
        </footer>
      </div>
    </main>
  );
}

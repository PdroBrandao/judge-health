// ============================================================
// /evidence/[id] — Case Detail
//
// Server component: fetches case data, passes to CaseDetail
// client component for interactive blind review.
// ============================================================
import { notFound } from "next/navigation";
import Link from "next/link";
import { FixtureRepository } from "@/data/fixture-repository";
import { WorkflowStore } from "@/data/workflow-store";
import { InstrumentPanel } from "@/components/instrument/InstrumentPanel";
import { CaseDetail } from "@/components/CaseDetail";

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const activeVersion = FixtureRepository.getActiveEvaluatorVersion();
  const detail = FixtureRepository.getCaseDetail(id, activeVersion.version);

  if (!detail) notFound();

  const existingBlindReview = WorkflowStore.getBlindReview(id);

  const resultLabels = {
    TP: "TP — Correct FAIL",
    TN: "TN — Correct PASS",
    FP: "FP — False Alarm",
    FN: "FN — MISSED FAIL",
  };

  return (
    <main className="min-h-screen bg-jh-bg p-3 lg:p-4">
      <div className="max-w-[860px] mx-auto">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-jh-border-lt font-mono text-[11px]">
          <Link href="/evidence" className="text-jh-dim hover:text-jh-text transition-colors">
            Evidence
          </Link>
          <span className="text-jh-border-lt">›</span>
          <span className="text-jh-text">{id}</span>
        </div>

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

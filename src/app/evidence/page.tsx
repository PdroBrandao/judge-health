// ============================================================
// /evidence — Evidence List
//
// Shows all cases in two analytically separate streams:
//   Representative (valid for population estimates)
//   Targeted/Risk (investigation only — excluded from metrics)
//
// Disagreements (FN and FP) are highlighted.
// Cases with rich content link to /evidence/[id].
// ============================================================
import Link from "next/link";
import { FixtureRepository } from "@/data/fixture-repository";
import { InstrumentPanel } from "@/components/instrument/InstrumentPanel";
import { StatusLED } from "@/components/instrument/StatusLED";
import type { EvidenceSummary, CaseResult } from "@/core/types";

// ── Result cell helpers ───────────────────────────────────────
const RESULT_STYLES: Record<CaseResult, { label: string; color: string; led: "ok" | "error" | "warning" | "inactive" }> = {
  TP: { label: "TP ✓",        color: "text-jh-green",  led: "ok" },
  TN: { label: "TN ✓",        color: "text-jh-dim",    led: "ok" },
  FP: { label: "FP — alarm",  color: "text-jh-amber",  led: "warning" },
  FN: { label: "FN ← MISSED", color: "text-jh-red",    led: "error" },
};

function ResultBadge({ result }: { result: CaseResult }) {
  const s = RESULT_STYLES[result];
  return (
    <div className="flex items-center gap-1.5">
      <StatusLED status={s.led} size="sm" />
      <span className={`font-mono text-[10px] font-semibold ${s.color}`}>
        {s.label}
      </span>
    </div>
  );
}

// ── Evidence table ────────────────────────────────────────────
function EvidenceTable({
  rows,
  showRiskNote = false,
}: {
  rows: EvidenceSummary[];
  showRiskNote?: boolean;
}) {
  const disagreements = rows.filter((r) => r.result === "FN" || r.result === "FP");
  const agreements    = rows.filter((r) => r.result === "TP" || r.result === "TN");
  const ordered = [...disagreements, ...agreements];

  return (
    <table className="w-full text-[11px] font-mono">
      <thead>
        <tr className="border-b border-jh-border bg-jh-bg/60 text-jh-dim text-[10px] uppercase tracking-[0.1em]">
          <th className="text-left px-3 py-2 font-normal">Case ID</th>
          <th className="text-left px-3 py-2 font-normal">Input preview</th>
          <th className="text-center px-2 py-2 font-normal">Truth</th>
          <th className="text-center px-2 py-2 font-normal">Evaluator</th>
          <th className="text-left px-3 py-2 font-normal">Result</th>
          {showRiskNote && (
            <th className="text-left px-3 py-2 font-normal">Risk note</th>
          )}
          <th className="px-2 py-2" />
        </tr>
      </thead>
      <tbody>
        {ordered.map((row) => {
          const isMiss = row.result === "FN" || row.result === "FP";
          return (
            <tr
              key={row.caseId}
              className={`border-b border-jh-border-lt ${isMiss ? "bg-red-50/30" : ""}`}
            >
              {/* Case ID */}
              <td className="px-3 py-2 font-mono text-[10px] text-jh-text whitespace-nowrap">
                {row.caseId}
              </td>

              {/* Input preview */}
              <td className="px-3 py-2 text-jh-dim max-w-[280px]">
                <span className="line-clamp-1">
                  {row.inputPreview ?? <span className="text-jh-border-mid italic">—</span>}
                </span>
              </td>

              {/* Ground truth */}
              <td className="px-2 py-2 text-center">
                <span
                  className={`font-semibold ${
                    row.groundTruth === "FAIL" ? "text-jh-red" : "text-jh-green"
                  }`}
                >
                  {row.groundTruth}
                </span>
              </td>

              {/* Evaluator */}
              <td className="px-2 py-2 text-center">
                <span
                  className={`${
                    row.evaluatorLabel === "FAIL" ? "text-jh-red" : "text-jh-dim"
                  }`}
                >
                  {row.evaluatorLabel}
                </span>
              </td>

              {/* Result */}
              <td className="px-3 py-2">
                <ResultBadge result={row.result} />
              </td>

              {/* Risk note (targeted only) */}
              {showRiskNote && (
                <td className="px-3 py-2 text-jh-amber max-w-[200px]">
                  <span className="line-clamp-1 text-[10px]">
                    {row.riskNote ?? "—"}
                  </span>
                </td>
              )}

              {/* View link */}
              <td className="px-2 py-2 text-right">
                {row.hasContent ? (
                  <Link
                    href={`/evidence/${row.caseId}`}
                    className="font-mono text-[10px] text-jh-text border border-jh-border-lt px-2 py-0.5 hover:border-jh-border hover:bg-jh-bg transition-colors whitespace-nowrap"
                  >
                    View →
                  </Link>
                ) : (
                  <span className="font-mono text-[10px] text-jh-border-mid">—</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Page ─────────────────────────────────────────────────────
export default function EvidencePage() {
  const repSummaries = FixtureRepository.getEvidenceSummaries("representative");
  const trgSummaries = FixtureRepository.getEvidenceSummaries("targeted_risk");

  const repFN = repSummaries.filter((r) => r.result === "FN").length;
  const repFP = repSummaries.filter((r) => r.result === "FP").length;
  const trgFN = trgSummaries.filter((r) => r.result === "FN").length;

  return (
    <main className="min-h-screen bg-jh-bg p-3 lg:p-4">
      <div className="max-w-[1100px] mx-auto">

        {/* Page identity */}
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-jh-border-lt">
          <div>
            <h2 className="font-sketch text-[1.6rem] font-bold leading-none tracking-wide text-jh-text">
              Evidence
            </h2>
            <p className="font-mono text-[11px] text-jh-dim mt-0.5">
              All evaluated cases — representative and targeted/risk streams.
            </p>
          </div>
          <span className="font-mono text-[10px] text-jh-dim border border-jh-border-lt px-2 py-1">
            TEST ENVIRONMENT · FIXTURE DATA
          </span>
        </div>

        {/* Notice */}
        <div className="font-mono text-[10px] text-jh-dim border border-jh-border-lt bg-jh-panel px-3 py-2 mb-3">
          <span className="font-semibold text-jh-text">Analytical boundary: </span>
          Representative and targeted/risk streams are kept separate.
          Population-level reliability estimates use the representative stream only.
          Targeted/risk cases are selected for investigation, not as an unbiased sample.
        </div>

        {/* ── REPRESENTATIVE SAMPLE ── */}
        <InstrumentPanel
          label={`Representative Sample — n=${repSummaries.length} · population estimates valid`}
          className="mb-3"
          noPadding
        >
          {/* Stats bar */}
          <div className="flex items-center gap-6 px-3 py-2 border-b border-jh-border-lt bg-jh-bg/40 font-mono text-[10px]">
            <span className="text-jh-dim">
              Distribution:{" "}
              <span className="text-jh-text">
                {repSummaries.filter((r) => r.groundTruth === "PASS").length} PASS /{" "}
                {repSummaries.filter((r) => r.groundTruth === "FAIL").length} FAIL
              </span>
            </span>
            <span className="text-jh-green">
              ✓ {repSummaries.filter((r) => r.result === "TP" || r.result === "TN").length} correct
            </span>
            {repFN > 0 && (
              <span className="text-jh-red font-semibold">
                ● {repFN} missed FAIL (FN) ← investigation priority
              </span>
            )}
            {repFP > 0 && (
              <span className="text-jh-amber">
                ▲ {repFP} false alarm (FP)
              </span>
            )}
          </div>

          <EvidenceTable rows={repSummaries} />
        </InstrumentPanel>

        {/* ── TARGETED/RISK SAMPLE ── */}
        <InstrumentPanel
          label={`Targeted / Risk Sample — n=${trgSummaries.length} · excluded from population estimates`}
          noPadding
        >
          {/* Warning */}
          <div className="px-3 py-1.5 border-b border-jh-border-lt bg-amber-50/30 font-mono text-[10px] text-jh-amber">
            These cases were selected for investigation due to elevated risk, known failure patterns, or
            manual flagging. They are NOT an unbiased sample of the population.
          </div>

          {/* Stats bar */}
          <div className="flex items-center gap-6 px-3 py-2 border-b border-jh-border-lt bg-jh-bg/40 font-mono text-[10px]">
            <span className="text-jh-dim">
              Composition:{" "}
              <span className="text-jh-text">
                {trgSummaries.filter((r) => r.groundTruth === "FAIL").length} FAIL (high-risk) /{" "}
                {trgSummaries.filter((r) => r.groundTruth === "PASS").length} PASS (edge case)
              </span>
            </span>
            {trgFN > 0 && (
              <span className="text-jh-red font-semibold">
                ● {trgFN} missed FAIL (FN) — evaluator did not catch
              </span>
            )}
          </div>

          <EvidenceTable rows={trgSummaries} showRiskNote />
        </InstrumentPanel>

        {/* Footer */}
        <footer className="mt-4 pt-3 border-t border-jh-border-lt text-center">
          <span className="font-mono text-[10px] text-jh-dim">
            JUDGE HEALTH v0.1 · AACI Framework · Pedro Brandão · Milestone 2
          </span>
        </footer>
      </div>
    </main>
  );
}

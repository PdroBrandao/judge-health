// ============================================================
// Compact evaluation summary for /evidence.
// Representative metrics and targeted/risk results stay separate.
// A decision is shown only when one was already recorded.
// ============================================================
import Link from "next/link";
import { InstrumentPanel } from "@/components/instrument/InstrumentPanel";
import { StatusLED } from "@/components/instrument/StatusLED";
import {
  formatCountRatio,
  formatDefinedPct,
  type EvaluationSummaryModel,
} from "@/app/evidence/evaluation-summary";

function CaseLinks({
  ids,
  runId,
  tone,
}: {
  ids: string[];
  runId: string | null;
  tone: string;
}) {
  if (ids.length === 0) {
    return <span className="text-jh-dim">none</span>;
  }
  return (
    <span className="inline-flex flex-wrap gap-1">
      {ids.map((id) => (
        <Link
          key={id}
          href={runId ? `/evidence/${id}?run=${runId}` : `/evidence/${id}`}
          className={`border border-current/30 px-1 hover:bg-jh-bg ${tone}`}
        >
          {id}
        </Link>
      ))}
    </span>
  );
}

function MetricLine({
  label,
  value,
  detail,
  tone = "text-jh-text",
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-jh-dim">{label}</span>
      <span className={`font-semibold tabular-nums text-right ${tone}`}>
        {value}
        {detail && (
          <span className="font-normal text-jh-dim ml-1.5">{detail}</span>
        )}
      </span>
    </div>
  );
}

export function EvaluationSummaryPanel({
  summary,
  selectedRunId,
  runLabel,
}: {
  summary: EvaluationSummaryModel | null;
  selectedRunId: string | null;
  runLabel: string | null;
}) {
  const decision = summary?.recordedDecision ?? null;
  const accent =
    decision?.decision === "rejected"
      ? "error"
      : decision?.decision === "accepted"
        ? "ok"
        : undefined;

  const rep = summary?.representative;
  const trg = summary?.targeted;
  const missed = trg?.missedFailIds ?? [];

  return (
    <InstrumentPanel
      label="Evaluation Summary"
      className="mb-3"
      noPadding
      accent={accent}
    >
      <div className="px-3 py-1.5 border-b border-jh-border-lt bg-jh-bg/40 font-mono text-[10px] text-jh-dim">
        <span className="font-semibold text-jh-text">Simulated reference. </span>
        Labels in this research prototype are demonstration data, not independent human annotation.
        {runLabel && (
          <>
            {" "}
            Source: <span className="text-jh-text">{runLabel}</span>.
          </>
        )}
      </div>

      {!summary || !rep || !trg ? (
        <div className="px-3 py-3 font-mono text-[10px] text-jh-dim">
          Select a live baseline or candidate run to compute this summary.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x divide-jh-border-lt">
            <section className="px-3 py-2 font-mono text-[11px]" aria-label="Representative sample metrics">
              <div className="text-[9px] uppercase tracking-[0.14em] text-jh-dim mb-1">
                Representative sample · population estimates
                {rep.judgedN < rep.sampleN && (
                  <span className="text-jh-amber normal-case tracking-normal">
                    {" "}
                    · judged {rep.judgedN}/{rep.sampleN}
                  </span>
                )}
              </div>
              <MetricLine
                label="Overall agreement"
                value={formatDefinedPct(rep.agreementDefined, rep.overallAgreement)}
                detail={formatCountRatio(rep.correct, rep.sampleN)}
              />
              <MetricLine
                label="FAIL recall"
                value={formatDefinedPct(rep.failRecallDefined, rep.failRecall)}
                detail={formatCountRatio(rep.failRecallHits, rep.failRecallSupport)}
                tone={rep.fn > 0 ? "text-jh-red" : "text-jh-text"}
              />
              <MetricLine
                label="FAIL precision"
                value={formatDefinedPct(rep.failPrecisionDefined, rep.failPrecision)}
                detail={formatCountRatio(rep.failPrecisionHits, rep.failPrecisionSupport)}
              />
              <MetricLine
                label="False positives"
                value={String(rep.fp)}
                tone={rep.fp > 0 ? "text-jh-amber" : "text-jh-text"}
              />
              {rep.fp > 0 && rep.fpCaseIds.length <= 3 && (
                <div className="text-[10px] text-jh-amber pl-2 pb-0.5">
                  <CaseLinks ids={rep.fpCaseIds} runId={selectedRunId} tone="text-jh-amber" />
                </div>
              )}
              <MetricLine
                label="False negatives"
                value={String(rep.fn)}
                tone={rep.fn > 0 ? "text-jh-red" : "text-jh-text"}
              />
              {rep.fn > 0 && (
                <div className="text-[10px] pl-2">
                  <CaseLinks ids={rep.fnCaseIds} runId={selectedRunId} tone="text-jh-red" />
                </div>
              )}
            </section>

            <section
              className="px-3 py-2 font-mono text-[11px] bg-amber-50/30"
              aria-label="Targeted risk results"
            >
              <div className="text-[9px] uppercase tracking-[0.14em] text-jh-amber mb-1">
                Targeted / risk · excluded from population estimates
                {trg.judgedN < trg.sampleN && (
                  <span className="normal-case tracking-normal">
                    {" "}
                    · judged {trg.judgedN}/{trg.sampleN}
                  </span>
                )}
              </div>
              <MetricLine
                label="FAIL detected"
                value={formatCountRatio(trg.failDetected, trg.failSupport)}
                tone={missed.length > 0 || trg.unevaluatedFailIds.length > 0 ? "text-jh-red" : "text-jh-text"}
              />
              <div className="flex items-baseline justify-between gap-3 py-0.5">
                <span className="text-jh-dim">Missed FAIL</span>
                <span className={missed.length > 0 ? "text-jh-red font-semibold" : "text-jh-text font-semibold"}>
                  {trg.fn}
                </span>
              </div>
              <div className="text-[10px] pl-2 pb-0.5">
                <CaseLinks
                  ids={missed}
                  runId={selectedRunId}
                  tone={missed.length > 0 ? "text-jh-red font-semibold" : "text-jh-dim"}
                />
              </div>
              {trg.unevaluatedFailIds.length > 0 && (
                <div className="text-[10px] text-jh-amber py-0.5">
                  Not yet judged: {trg.unevaluatedFailIds.join(", ")}
                </div>
              )}
              <MetricLine
                label="False positives"
                value={String(trg.fp)}
                tone={trg.fp > 0 ? "text-jh-amber" : "text-jh-text"}
              />
              {trg.fp > 0 && trg.fpCaseIds.length <= 3 && (
                <div className="text-[10px] pl-2">
                  <CaseLinks ids={trg.fpCaseIds} runId={selectedRunId} tone="text-jh-amber" />
                </div>
              )}
              {missed.length > 0 && (
                <p className="mt-1.5 text-[10px] text-jh-red font-semibold leading-snug">
                  Targeted FAIL missed. This is not included in overall agreement.
                </p>
              )}
            </section>
          </div>

          {decision && (
            <div
              className={`px-3 py-2 border-t border-jh-border-lt font-mono text-[10px] ${
                decision.decision === "rejected" ? "bg-red-50/40" : "bg-green-50/30"
              }`}
            >
              <div className="flex items-center gap-2">
                <StatusLED
                  status={decision.decision === "rejected" ? "error" : "ok"}
                  size="sm"
                  label={decision.decision === "rejected" ? "Recorded rejection" : "Recorded acceptance"}
                />
                <span className="uppercase tracking-[0.12em] text-jh-dim">
                  Evaluation status
                </span>
                <span
                  className={`font-semibold ${
                    decision.decision === "rejected" ? "text-jh-red" : "text-jh-green"
                  }`}
                >
                  {decision.decision === "rejected" ? "Rejected" : "Accepted"}
                </span>
                <span className="text-jh-dim">· recorded decision</span>
              </div>
              <p className="mt-1 text-jh-dim leading-snug line-clamp-3">
                {decision.rationale}
              </p>
              <p className="mt-1 text-jh-border-mid">
                Not inferred from overall agreement or trigger thresholds.
              </p>
            </div>
          )}
        </>
      )}
    </InstrumentPanel>
  );
}

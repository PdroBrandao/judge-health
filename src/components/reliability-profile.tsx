// ============================================================
// ReliabilityProfilePanel — per-class metrics
// Exported for use in stacked/mobile layout only.
// Desktop layout uses MetricReadout directly in page.tsx.
// ============================================================
import type { ReliabilityProfile } from "@/core/types";
import { pct } from "@/core/metrics";
import { MetricReadout } from "@/components/instrument/MetricReadout";

interface Props {
  profile: ReliabilityProfile;
  alertThreshold?: number; // FAIL recall threshold — highlights row if below
}

function ciStr(lower: number, upper: number): string {
  return `${pct(lower)} – ${pct(upper)}`;
}

export function ReliabilityProfilePanel({
  profile,
  alertThreshold = 0.7,
}: Props) {
  const { perClass, overallAgreement, overallAgreementCI, sampleN, uncertainty } = profile;

  return (
    <div className="space-y-0">
      {/* Overall agreement */}
      <div className="flex items-baseline justify-between px-2 py-2 border-b border-jh-border bg-jh-bg/30">
        <div>
          <span className="font-mono text-[11px] text-jh-dim">Overall Agreement</span>
          <span className="font-mono text-[10px] text-jh-border-mid ml-2">n={sampleN} representative</span>
        </div>
        <div className="text-right">
          <span className="font-mono font-bold text-lg tabular-nums text-jh-text">
            {pct(overallAgreement)}
          </span>
          <span className="block font-mono text-[10px] text-jh-dim">
            95% CI {ciStr(overallAgreementCI.lower, overallAgreementCI.upper)}
          </span>
        </div>
      </div>

      {/* FAIL class section */}
      <div className="px-2 py-1 border-b border-jh-border-lt bg-jh-bg/60">
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-jh-dim">
          FAIL Class · n={perClass.FAIL.support}
        </span>
      </div>
      <MetricReadout
        label="Recall (sensitivity)"
        value={pct(perClass.FAIL.recall)}
        ci={ciStr(perClass.FAIL.recallCI.lower, perClass.FAIL.recallCI.upper)}
        alert={perClass.FAIL.recall < alertThreshold}
      />
      <MetricReadout
        label="Precision"
        value={pct(perClass.FAIL.precision)}
        ci={ciStr(perClass.FAIL.precisionCI.lower, perClass.FAIL.precisionCI.upper)}
      />
      <MetricReadout label="False Positive Rate" value={pct(perClass.FAIL.falsePositiveRate)} />
      <MetricReadout label="False Negative Rate" value={pct(perClass.FAIL.falseNegativeRate)} />

      {/* PASS class section */}
      <div className="px-2 py-1 border-b border-jh-border-lt border-t border-jh-border bg-jh-bg/60">
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-jh-dim">
          PASS Class · n={perClass.PASS.support}
        </span>
      </div>
      <MetricReadout
        label="Recall (sensitivity)"
        value={pct(perClass.PASS.recall)}
        ci={ciStr(perClass.PASS.recallCI.lower, perClass.PASS.recallCI.upper)}
      />
      <MetricReadout
        label="Precision"
        value={pct(perClass.PASS.precision)}
        ci={ciStr(perClass.PASS.precisionCI.lower, perClass.PASS.precisionCI.upper)}
      />
      <MetricReadout label="False Positive Rate" value={pct(perClass.PASS.falsePositiveRate)} />
      <MetricReadout label="False Negative Rate" value={pct(perClass.PASS.falseNegativeRate)} />

      {/* Uncertainty */}
      <div className="px-2 py-1.5 border-t border-jh-border text-[10px] font-mono text-jh-dim bg-amber-50/30">
        <span className="font-semibold text-jh-amber">Uncertainty:</span>{" "}
        {uncertainty.note} Widest CI: {uncertainty.widestRecallClass} class (
        {ciStr(uncertainty.widestRecallCI.lower, uncertainty.widestRecallCI.upper)}).
      </div>
    </div>
  );
}

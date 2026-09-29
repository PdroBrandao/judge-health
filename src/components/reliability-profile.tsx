// ============================================================
// ReliabilityProfilePanel – per-class metrics with Wilson CIs
// ============================================================
import type { ReliabilityProfile, Label } from "@/core/types";
import { pct } from "@/core/metrics";

interface Props {
  profile: ReliabilityProfile;
}

function CI({ lower, upper }: { lower: number; upper: number }) {
  return (
    <span className="text-slate-400 text-xs">
      ({pct(lower)} – {pct(upper)})
    </span>
  );
}

function MetricRow({
  label,
  value,
  ci,
  highlight,
}: {
  label: string;
  value: number;
  ci?: { lower: number; upper: number };
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between py-1.5 px-2 rounded ${
        highlight ? "bg-red-50 border border-red-200" : ""
      }`}
    >
      <span className="text-sm text-slate-600">{label}</span>
      <div className="text-right">
        <span
          className={`font-semibold tabular-nums ${
            highlight ? "text-red-700" : "text-slate-800"
          }`}
        >
          {pct(value)}
        </span>
        {ci && (
          <div>
            <CI lower={ci.lower} upper={ci.upper} />
          </div>
        )}
      </div>
    </div>
  );
}

function ClassCard({ label, profile }: { label: Label; profile: ReliabilityProfile }) {
  const m = profile.perClass[label];
  const isFail = label === "FAIL";
  const headerClass = isFail
    ? "bg-red-600 text-white"
    : "bg-green-600 text-white";

  return (
    <div className="rounded-lg overflow-hidden border border-slate-200 shadow-sm">
      <div className={`px-3 py-2 font-semibold text-sm flex justify-between ${headerClass}`}>
        <span>{label} class</span>
        <span className="text-xs font-normal opacity-80">n={m.support}</span>
      </div>
      <div className="p-3 space-y-1 bg-white">
        <MetricRow
          label="Recall (sensitivity)"
          value={m.recall}
          ci={m.recallCI}
          highlight={isFail && m.recall < 0.7}
        />
        <MetricRow
          label="Precision"
          value={m.precision}
          ci={m.precisionCI}
        />
        <MetricRow
          label="False Positive Rate"
          value={m.falsePositiveRate}
        />
        <MetricRow
          label="False Negative Rate"
          value={m.falseNegativeRate}
        />
      </div>
    </div>
  );
}

export function ReliabilityProfilePanel({ profile }: Props) {
  return (
    <div className="space-y-4">
      {/* Overall agreement */}
      <div className="flex items-center justify-between bg-slate-50 rounded-lg p-4 border border-slate-200">
        <div>
          <div className="text-sm font-medium text-slate-600">Overall Agreement</div>
          <div className="text-xs text-slate-400">
            n={profile.sampleN} representative cases
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold tabular-nums text-slate-800">
            {pct(profile.overallAgreement)}
          </div>
          <div className="text-xs text-slate-400">
            95% CI{" "}
            <CI
              lower={profile.overallAgreementCI.lower}
              upper={profile.overallAgreementCI.upper}
            />
          </div>
        </div>
      </div>

      {/* Per-class breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ClassCard label="FAIL" profile={profile} />
        <ClassCard label="PASS" profile={profile} />
      </div>

      {/* Uncertainty note */}
      <div className="text-xs text-slate-500 bg-amber-50 border border-amber-200 rounded p-3">
        <span className="font-semibold text-amber-700">Uncertainty:</span>{" "}
        {profile.uncertainty.note} Widest recall CI: {profile.uncertainty.widestRecallClass} class
        (
        <CI
          lower={profile.uncertainty.widestRecallCI.lower}
          upper={profile.uncertainty.widestRecallCI.upper}
        />
        ).
      </div>
    </div>
  );
}

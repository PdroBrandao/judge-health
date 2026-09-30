// ============================================================
// ReliabilityGauge — precision semicircular gauge
//
// Design: "the interface is sketched; the measurement is precise."
//
// The numeric readout sits BELOW the pivot point so the needle
// never crosses the text regardless of value.
//
// Structure:
//   - Clean gray background arc (track)
//   - Thin progress arc (0 → value)
//   - Major ticks (5) + minor ticks (8) in 0–100% scale
//   - Threshold line with "LIMIT X%" label
//   - Triangular needle (graphite = healthy, red = fired)
//   - Mechanical pivot
//   - Value + metric name below pivot (outside arc, never obscured)
// ============================================================

const CX = 100;
const CY = 95;         // pivot center — pushed up to leave readout room below

const R_TRACK   = 80;  // background arc
const R_VALUE   = 80;  // progress arc (same radius, different stroke color)
const R_NEEDLE  = 73;  // needle tip
const R_BACK    = 8;   // needle tail past pivot
const R_TICK_O_MAJ = 85;  // major tick outer
const R_TICK_I_MAJ = 79;  // major tick inner (6px tick)
const R_TICK_O_MIN = 84;  // minor tick outer
const R_TICK_I_MIN = 81;  // minor tick inner (3px tick)
const R_LIMIT_O = 89;  // threshold line outer
const R_LIMIT_I = 74;  // threshold line inner

function f(n: number, d = 2) { return n.toFixed(d); }

// [0,1] → (x,y) on upper semicircle. v=0 → left, v=1 → right.
function pt(r: number, v: number) {
  const a = Math.PI * (1 - v);
  return { x: CX + r * Math.cos(a), y: CY - r * Math.sin(a) };
}

// Arc path from v1 to v2 at radius r (counterclockwise)
function arcPath(r: number, v1: number, v2: number): string {
  const s = pt(r, v1);
  const e = pt(r, v2);
  const span = Math.abs(v2 - v1);
  return `M ${f(s.x)} ${f(s.y)} A ${r} ${r} 0 ${span > 0.5 ? 1 : 0} 0 ${f(e.x)} ${f(e.y)}`;
}

// Needle triangle polygon
function needlePoly(value: number): string {
  const angle = Math.PI * (1 - value);
  const tip  = { x: CX + R_NEEDLE * Math.cos(angle), y: CY - R_NEEDLE * Math.sin(angle) };
  const back = { x: CX - R_BACK  * Math.cos(angle), y: CY + R_BACK  * Math.sin(angle) };
  const px = -Math.sin(angle);
  const py = -Math.cos(angle);
  const W = 2.8; // half-width at base
  return [
    `${f(tip.x)},${f(tip.y)}`,
    `${f(CX + px * W)},${f(CY + py * W)}`,
    `${f(back.x)},${f(back.y)}`,
    `${f(CX - px * W)},${f(CY - py * W)}`,
  ].join(" ");
}

function tickLine(rI: number, rO: number, v: number) {
  const i = pt(rI, v), o = pt(rO, v);
  return { x1: f(i.x), y1: f(i.y), x2: f(o.x), y2: f(o.y) };
}

interface Props {
  value: number;
  threshold: number;
  metricLabel: string;
  fired: boolean;
}

// Tick positions as 0–1 fractions; labels shown as 0–100%
const MAJOR_TICKS  = [0, 0.25, 0.5, 0.75, 1.0];
const MINOR_TICKS  = [0.1, 0.2, 0.3, 0.4, 0.6, 0.7, 0.8, 0.9];
const TICK_LABELS: [number, string][] = [
  [0, "0"], [0.25, "25"], [0.5, "50"], [0.75, "75"], [1.0, "100"],
];

export function ReliabilityGauge({ value, threshold, metricLabel, fired }: Props) {
  const v  = Math.max(0, Math.min(1, value));
  const th = Math.max(0, Math.min(1, threshold));

  const stateColor    = fired ? "var(--jh-red)"  : "var(--jh-text)";
  const stateColorDim = fired ? "rgba(153,27,27,0.18)" : "rgba(17,17,17,0.10)";
  const valueColor    = fired ? "var(--jh-red)"  : "var(--jh-text)";

  // Threshold label placed just outside the bezel, opposite the line
  const thrLabelPt   = pt(R_LIMIT_O + 6, th);
  const thrTextAnchor = th < 0.5 ? "end" : "start";

  // viewBox height = CY + pivot radius + readout rows + bottom margin
  // CY=95, readout at y=114 and y=127 → viewBox height = 143
  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox="0 0 200 143"
        aria-label={`${metricLabel} gauge: ${(v * 100).toFixed(1)}%`}
        role="img"
        className="w-full max-w-[220px]"
      >
        {/* ── Background track ── */}
        <path
          d={arcPath(R_TRACK, 0, 1)}
          fill="none"
          stroke="var(--jh-border-lt)"
          strokeWidth="10"
          strokeLinecap="butt"
        />

        {/* ── Value progress arc ── */}
        {v > 0.005 && (
          <path
            d={arcPath(R_VALUE, 0, v)}
            fill="none"
            stroke={stateColorDim}
            strokeWidth="10"
            strokeLinecap="butt"
          />
        )}

        {/* ── Minor ticks ── */}
        {MINOR_TICKS.map((tv) => {
          const t = tickLine(R_TICK_I_MIN, R_TICK_O_MIN, tv);
          return <line key={tv} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
            stroke="var(--jh-border-mid)" strokeWidth="0.7" />;
        })}

        {/* ── Major ticks ── */}
        {MAJOR_TICKS.map((tv) => {
          const t = tickLine(R_TICK_I_MAJ, R_TICK_O_MAJ, tv);
          return <line key={tv} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
            stroke="var(--jh-border)" strokeWidth="1.3" />;
        })}

        {/* ── Tick labels (percentage scale) ── */}
        {TICK_LABELS.map(([tv, lbl]) => {
          const lp = pt(R_TICK_O_MAJ + 7, tv);
          const anchor =
            tv === 0 ? "middle" : tv === 1 ? "middle" :
            tv < 0.5 ? "end" : tv === 0.5 ? "middle" : "start";
          return (
            <text key={tv}
              x={f(lp.x)} y={f(lp.y + 3)}
              fill="var(--jh-dim)" fontSize="6"
              fontFamily="var(--font-geist-mono), monospace"
              textAnchor={anchor}
            >{lbl}</text>
          );
        })}

        {/* ── Threshold line ── */}
        <line
          x1={f(pt(R_LIMIT_I, th).x)} y1={f(pt(R_LIMIT_I, th).y)}
          x2={f(pt(R_LIMIT_O, th).x)} y2={f(pt(R_LIMIT_O, th).y)}
          stroke="var(--jh-border)" strokeWidth="1.5" strokeDasharray="3 2"
        />

        {/* Threshold label */}
        <text
          x={f(thrLabelPt.x + (th <= 0.5 ? -2 : 2))}
          y={f(thrLabelPt.y + 3)}
          fill="var(--jh-dim)" fontSize="5.5"
          fontFamily="var(--font-geist-mono), monospace"
          textAnchor={thrTextAnchor} fontWeight="600" letterSpacing="0.04em"
        >
          LIMIT {(th * 100).toFixed(0)}%
        </text>

        {/* ── Needle — points upward from pivot, stays in upper half ── */}
        <polygon points={needlePoly(v)} fill={stateColor} />

        {/* ── Pivot ── */}
        <circle cx={CX} cy={CY} r="4.5" fill="var(--jh-text)" />
        <circle cx={CX} cy={CY} r="2"   fill="var(--jh-panel)" />

        {/* ── Readout — BELOW pivot, never obscured by needle ── */}
        <text
          x={CX} y={CY + 19}
          fill={valueColor} fontSize="22"
          fontFamily="var(--font-geist-mono), monospace"
          fontWeight="700" textAnchor="middle" letterSpacing="-0.02em"
        >
          {(v * 100).toFixed(1)}%
        </text>

        <text
          x={CX} y={CY + 32}
          fill="var(--jh-dim)" fontSize="7"
          fontFamily="var(--font-geist-mono), monospace"
          textAnchor="middle" letterSpacing="0.1em"
        >
          {metricLabel}
        </text>
      </svg>
    </div>
  );
}

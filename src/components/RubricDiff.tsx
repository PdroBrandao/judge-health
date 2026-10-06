// ============================================================
// RubricDiff — line-level textual diff between two rubric strings
//
// Pure display component (server-renderable).
// Uses a simple LCS-based line diff — no external library.
//
// Renders:
//   unchanged lines → dim
//   added lines     → green, prefixed "+"
//   removed lines   → red, prefixed "-"
// ============================================================

// ── LCS-based line diff ───────────────────────────────────────

type DiffOp = "unchanged" | "added" | "removed";

interface DiffLine {
  op: DiffOp;
  text: string;
}

/**
 * Computes a unified line-level diff from `before` to `after`.
 * Uses Myers' LCS reduction: build LCS table, then emit changed lines.
 */
function computeLineDiff(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");

  const m = a.length;
  const n = b.length;

  // Build LCS length table (m+1) × (n+1)
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack to produce diff lines
  const result: DiffLine[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.unshift({ op: "unchanged", text: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ op: "added", text: b[j - 1] });
      j--;
    } else {
      result.unshift({ op: "removed", text: a[i - 1] });
      i--;
    }
  }

  return result;
}

// ── Styles ────────────────────────────────────────────────────

const LINE_STYLES: Record<DiffOp, { prefix: string; className: string }> = {
  unchanged: { prefix: " ",  className: "text-jh-dim" },
  added:     { prefix: "+",  className: "text-jh-green" },
  removed:   { prefix: "-",  className: "text-jh-red line-through opacity-70" },
};

// ── Props ─────────────────────────────────────────────────────

interface RubricDiffProps {
  before: string;
  after: string;
  beforeLabel?: string;
  afterLabel?: string;
}

// ── Component ─────────────────────────────────────────────────

export function RubricDiff({
  before,
  after,
  beforeLabel = "Baseline",
  afterLabel  = "Promoted Candidate",
}: RubricDiffProps) {
  const diff = computeLineDiff(before, after);
  const hasChanges = diff.some((l) => l.op !== "unchanged");

  return (
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex items-center gap-4 font-mono text-[9px] uppercase tracking-[0.14em]">
        <span className="text-jh-dim">{beforeLabel} → {afterLabel}</span>
        <span className="flex items-center gap-1 text-jh-green">
          <span className="font-bold">+</span> added
        </span>
        <span className="flex items-center gap-1 text-jh-red">
          <span className="font-bold">-</span> removed
        </span>
        {!hasChanges && (
          <span className="text-jh-amber ml-auto">no rubric changes detected</span>
        )}
      </div>

      {/* Diff body */}
      <pre className="font-mono text-[10px] leading-relaxed bg-jh-bg border border-jh-border-lt p-3 overflow-auto max-h-[480px] whitespace-pre-wrap">
        {diff.map((line, i) => {
          const { prefix, className } = LINE_STYLES[line.op];
          return (
            <span key={i} className={`block ${className}`}>
              <span className="select-none opacity-50 mr-2">{prefix}</span>
              {line.text}
            </span>
          );
        })}
      </pre>
    </div>
  );
}

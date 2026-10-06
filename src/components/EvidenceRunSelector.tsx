"use client";
// ============================================================
// EvidenceRunSelector — run/version picker for the Evidence page
//
// Client component: uses useRouter to navigate to ?run=<runId>
// when a different run is selected. Receives serializable
// RunOption[] from the server component — no server imports.
//
// Renders as a horizontal scrollable strip of buttons.
// Each button shows: type badge, version, model, status dot,
// evaluated count, and highlighted state when selected.
// ============================================================
import { useRouter } from "next/navigation";
import type { RunOption } from "@/app/evidence/page";

// ── Status dot ────────────────────────────────────────────────
function StatusDot({ status }: { status: string }) {
  const color =
    status === "completed" || status === "partial_failure"
      ? "bg-jh-led-green shadow-[0_0_5px_var(--jh-led-green)]"
      : status === "running"
      ? "bg-jh-led-amber shadow-[0_0_5px_var(--jh-led-amber)]"
      : "bg-jh-border-mid";
  return <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${color}`} />;
}

// ── Props ─────────────────────────────────────────────────────
interface Props {
  options: RunOption[];
  currentRunId: string | null;
}

// ── Component ─────────────────────────────────────────────────
export function EvidenceRunSelector({ options, currentRunId }: Props) {
  const router = useRouter();

  function selectRun(runId: string) {
    router.push(`/evidence?run=${encodeURIComponent(runId)}`);
  }

  if (options.length === 0) return null;

  return (
    <div
      className="flex items-stretch gap-2 overflow-x-auto pb-1"
      role="tablist"
      aria-label="Select evaluation run"
    >
      {/* Label */}
      <div className="shrink-0 flex items-center font-mono text-[9px] uppercase tracking-[0.14em] text-jh-dim pr-2 border-r border-jh-border-lt mr-1">
        Run
      </div>

      {options.map((opt) => {
        const isSelected = opt.runId === currentRunId;
        const isComplete = opt.status === "completed" || opt.status === "partial_failure";
        const isIncomplete = opt.judgedCount < opt.totalCount && opt.status === "running";

        return (
          <button
            key={opt.runId}
            role="tab"
            aria-selected={isSelected}
            onClick={() => selectRun(opt.runId)}
            className={[
              "shrink-0 flex flex-col gap-1 text-left px-3 py-2 border transition-colors",
              "focus:outline-none focus-visible:ring-1 focus-visible:ring-jh-text",
              isSelected
                ? "border-jh-text bg-jh-panel text-jh-text"
                : "border-jh-border-lt bg-transparent text-jh-dim hover:border-jh-border hover:text-jh-text",
              opt.isCurrent && !isSelected
                ? "border-jh-amber/60"
                : "",
            ].filter(Boolean).join(" ")}
          >
            {/* Top row: badge + status dot */}
            <div className="flex items-center gap-1.5">
              <span className={`font-mono text-[8px] font-semibold uppercase tracking-[0.1em] px-1 py-0.5 ${
                opt.attemptNumber === null
                  ? isSelected ? "bg-jh-text text-jh-bg" : "bg-jh-border-lt text-jh-dim"
                  : opt.isCurrent
                  ? isSelected ? "bg-jh-amber text-jh-bg" : "bg-jh-amber/20 text-jh-amber"
                  : isSelected ? "bg-jh-text text-jh-bg" : "bg-jh-border-lt text-jh-dim"
              }`}>
                {opt.attemptNumber === null ? "BASELINE" : `ATTEMPT #${opt.attemptNumber}`}
              </span>
              <StatusDot status={opt.status} />
              {opt.isCurrent && (
                <span className="font-mono text-[8px] text-jh-amber uppercase tracking-wide">
                  CURRENT
                </span>
              )}
            </div>

            {/* Version */}
            <div className="font-mono text-[9px] text-jh-text leading-none">
              {opt.evaluatorVersion}
            </div>

            {/* Model + count */}
            <div className="flex items-center gap-2 font-mono text-[8px] text-jh-dim">
              <span>{opt.model}</span>
              <span className={isIncomplete ? "text-jh-amber" : ""}>
                {opt.judgedCount}/{opt.totalCount}
                {isIncomplete ? " ·IN PROGRESS" : ""}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

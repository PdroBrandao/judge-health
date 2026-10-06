// ============================================================
// AppNav — persistent instrument navigation bar
//
// Appears at the top of every page (rendered in layout.tsx).
// Single authoritative source of system state —
// the instrument's "front panel status display."
//
// Desktop — two rows:
//   Row 1: P. · JUDGE HEALTH [JH-001] · [LED] [SEAL] [alert link]
//   Row 2: OVERVIEW  EVIDENCE  DIAGNOSE  REVALIDATION  HISTORY
//
// Mobile — one compressed row + nav row:
//   Row 1: P. | JUDGE HEALTH          [●] DEGRADED
//   Row 2: nav links (scrollable)
// ============================================================
import Link from "next/link";
import { FixtureRepository } from "@/data/fixture-repository";
import { computeReliabilityProfile } from "@/core/metrics";
import { evaluateAllTriggers } from "@/core/triggers";
import type { MetricTriggerConfig } from "@/core/types";
import { StatusLED } from "@/components/instrument/StatusLED";
import { CalibrationSeal } from "@/components/instrument/CalibrationSeal";
import { AppNavActiveLink } from "@/components/AppNavActiveLink";

const NAV_LINKS = [
  { href: "/",              label: "OVERVIEW" },
  { href: "/evidence",      label: "EVIDENCE" },
  { href: "/diagnose",      label: "DIAGNOSE" },
  { href: "/intervention",  label: "INTERVENTION" },
  { href: "/revalidation",  label: "REVALIDATION" },
  { href: "/history",              label: "HISTORY" },
  { href: "/calibration-report",  label: "REPORT" },
] as const;

export async function AppNav() {
  // ── Compute current system state ─────────────────────────────
  const cases          = FixtureRepository.getCases();
  const activeVersion  = FixtureRepository.getActiveEvaluatorVersion();
  const triggerConfigs = FixtureRepository.getTriggerConfigs();
  const currentConfig  = FixtureRepository.getCurrentConfiguration();
  const baselineConfig = FixtureRepository.getBaselineConfiguration();

  // Use live baseline if available; fall back to fixture
  const { RunStore, liveJudgmentsToJudgments } = await import("@/data/run-store");
  const liveRun = RunStore.getBaselineRun();
  const isLive  = liveRun?.mode === "live" &&
    (liveRun.status === "completed" || liveRun.status === "partial_failure");
  const judgments = isLive
    ? liveJudgmentsToJudgments(liveRun!.judgments)
    : FixtureRepository.getBaselineJudgments();

  const profile = computeReliabilityProfile(cases, judgments, activeVersion.version);
  const triggerResults = evaluateAllTriggers(
    triggerConfigs, profile, currentConfig, baselineConfig
  );

  const firedCount = isLive ? triggerResults.filter((t) => t.fired).length : 0;
  const isHealthy  = isLive ? firedCount === 0 : true;
  const ledStatus  = !isLive ? ("inactive" as const) : isHealthy ? "ok" : ("error" as const);

  return (
    <nav
      className="bg-jh-panel border-b-2 border-jh-border"
      aria-label="Judge Health instrument navigation"
    >
      {/* ── DESKTOP header row (hidden on mobile) ── */}
      <div className="hidden sm:flex items-center justify-between px-4 py-2 border-b border-jh-border-lt">
        {/* Left: identity */}
        <div className="flex items-center gap-3">
          <span className="font-sketch text-xl font-bold text-jh-dim select-none leading-none" aria-hidden="true">
            P.
          </span>
          <div className="w-px h-4 bg-jh-border-lt" aria-hidden="true" />
          <Link
            href="/"
            className="font-sketch text-[1.3rem] font-bold leading-none text-jh-text tracking-wide hover:opacity-80 transition-opacity"
          >
            JUDGE HEALTH
          </Link>
          <span className="font-mono text-[9px] text-jh-dim border border-jh-border-lt px-1.5 py-0.5 ml-1">
            JH-001
          </span>
          {/* Mode badge */}
          {isLive ? (
            <span className="font-mono text-[9px] border border-jh-green/60 text-jh-green px-1.5 py-0.5 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-jh-led-green inline-block" />
              LIVE
            </span>
          ) : (
            <span className="font-mono text-[9px] text-jh-border-mid border border-jh-border-lt px-1.5 py-0.5">
              FIXTURE
            </span>
          )}
        </div>

        {/* Right: system state */}
        <div className="flex items-center gap-3">
          <StatusLED status={ledStatus} pulse={isLive && !isHealthy} />
          {isLive && <CalibrationSeal status={isHealthy ? "VALIDATED" : "DEGRADED"} compact />}
          {isLive && !isHealthy && (
            <Link
              href="/evidence"
              className="font-mono text-[10px] text-jh-red border border-jh-red/40 px-2 py-0.5 hover:bg-red-50/50 transition-colors"
            >
              {firedCount} trigger{firedCount > 1 ? "s" : ""} fired — Investigate →
            </Link>
          )}
          {!isLive && (
            <span className="font-mono text-[10px] text-jh-border-mid border border-jh-border-lt px-2 py-0.5">
              NOT EVALUATED
            </span>
          )}
        </div>
      </div>

      {/* ── MOBILE header row (hidden on sm+) ── */}
      <div className="flex sm:hidden items-center justify-between px-3 py-2 border-b border-jh-border-lt">
        {/* Left: compact identity */}
        <div className="flex items-center gap-2">
          <span className="font-sketch text-lg font-bold text-jh-dim select-none leading-none" aria-hidden="true">
            P.
          </span>
          <div className="w-px h-3.5 bg-jh-border-lt" aria-hidden="true" />
          <Link
            href="/"
            className="font-sketch text-[1.15rem] font-bold leading-none text-jh-text tracking-wide"
          >
            JUDGE HEALTH
          </Link>
        </div>

        {/* Right: LED + state label only (no CalibrationSeal on mobile) */}
        <div className="flex items-center gap-2">
          <StatusLED status={ledStatus} pulse={isLive && !isHealthy} />
          <span className={`font-mono text-[10px] font-semibold ${!isLive ? "text-jh-border-mid" : isHealthy ? "text-jh-green" : "text-jh-red"}`}>
            {!isLive ? "—" : isHealthy ? "VALIDATED" : "DEGRADED"}
          </span>
        </div>
      </div>

      {/* ── Navigation row (both desktop + mobile) ── */}
      <div className="flex items-center gap-0 px-2 sm:px-4 overflow-x-auto">
        {NAV_LINKS.map(({ href, label }) => (
          <AppNavActiveLink key={href} href={href} label={label} />
        ))}
        <div className="ml-auto shrink-0">
          <Link
            href="/settings"
            className="font-mono text-[10px] text-jh-dim hover:text-jh-text transition-colors py-2 px-3 inline-block whitespace-nowrap"
            aria-label="Settings"
          >
            ⚙ CONFIG
          </Link>
        </div>
      </div>
    </nav>
  );
}

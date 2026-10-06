// ============================================================
// Judge Health — History / Service Record
//
// Treats the instrument's history as a calibration and
// maintenance logbook. Each entry is a significant event in
// the evaluator lifecycle.
//
// Data: built from fixture evaluator versions + triggers.
// Entries are in reverse chronological order (most recent first).
// ============================================================
import { FixtureRepository } from "@/data/fixture-repository";
import { WorkflowStore } from "@/data/workflow-store";
import { InstrumentPanel } from "@/components/instrument/InstrumentPanel";
import { StatusLED } from "@/components/instrument/StatusLED";
import { CalibrationSeal } from "@/components/instrument/CalibrationSeal";
import type { LEDStatus } from "@/components/instrument/StatusLED";

// ── Log entry type ────────────────────────────────────────────
interface LogEntry {
  date: string;
  event: string;
  version: string;
  trigger: string;
  action: string;
  state: string;
  stateVariant: "ok" | "warning" | "error" | "dim";
  ledStatus: LEDStatus;
  seal?: "VALIDATED" | "DEGRADED" | "INVESTIGATING" | "REVALIDATION REQUIRED";
  detail?: string;
}

// ── Fixture-based log entries (reverse chronological) ─────────
function buildLogEntries(activeVersion: string): LogEntry[] {
  return [
    {
      date:         "2026-09-30",
      event:        "Metric trigger fired",
      version:      "v0.2.0",
      trigger:      "fail_recall_below_threshold",
      action:       "Investigation required",
      state:        "DEGRADED",
      stateVariant: "error",
      ledStatus:    "error",
      seal:         "DEGRADED",
      detail:       "FAIL Recall observed at 50.0% — below configured threshold of 70.0%. Candidate v0.3.0 under revalidation.",
    },
    {
      date:         "2026-09-20",
      event:        "Candidate created",
      version:      "v0.3.0-candidate",
      trigger:      "evaluator_version_changed",
      action:       "Revalidation required",
      state:        "UNDER REVIEW",
      stateVariant: "warning",
      ledStatus:    "warning",
      seal:         "INVESTIGATING",
      detail:       "Taxonomy update: new 'ambiguous-intent' subcategory added. Requires revalidation of affected cases.",
    },
    {
      date:         "2026-08-15",
      event:        "Revalidation accepted — candidate promoted",
      version:      "v0.2.0",
      trigger:      "evaluator_version_changed",
      action:       "Candidate promoted to active",
      state:        "VALIDATED",
      stateVariant: "ok",
      ledStatus:    "ok",
      seal:         "VALIDATED",
      detail:       "Calibration Run #0001: v0.2.0 accepted. FAIL Recall improved from 33.3% to 50.0%. v0.1.0 superseded.",
    },
    {
      date:         "2026-08-10",
      event:        "Candidate created",
      version:      "v0.2.0",
      trigger:      "evaluator_version_changed",
      action:       "Revalidation initiated",
      state:        "UNDER REVIEW",
      stateVariant: "warning",
      ledStatus:    "warning",
      detail:       "Rubric clarification: added explicit examples for FAIL-class edge cases. Validated against representative reference before promotion.",
    },
    {
      date:         "2026-08-01",
      event:        "Metric trigger fired",
      version:      "v0.1.0",
      trigger:      "fail_recall_below_threshold",
      action:       "Investigation opened",
      state:        "DEGRADED",
      stateVariant: "error",
      ledStatus:    "error",
      seal:         "DEGRADED",
      detail:       "FAIL Recall at 33.3% — rubric ambiguity identified as root cause. Correction via rubric-v0.2.",
    },
    {
      date:         "2026-07-01",
      event:        "Evaluator deployed",
      version:      "v0.1.0",
      trigger:      "—",
      action:       "Initial deployment",
      state:        "ACTIVE",
      stateVariant: "ok",
      ledStatus:    "ok",
      detail:       "Initial evaluator established. Binary PASS/FAIL rubric. Representative reference set RS-001 (n=60).",
    },
  ];
}

// ── State badge color ─────────────────────────────────────────
const STATE_COLOR: Record<string, string> = {
  ok:      "text-jh-green",
  warning: "text-jh-amber",
  error:   "text-jh-red",
  dim:     "text-jh-dim",
};

// ── Build dynamic entries from WorkflowStore (multi-attempt) ──
// Returns entries newest-first (reverse chronological).
function buildDynamicEntries(): LogEntry[] {
  const state = WorkflowStore.getState();
  const now   = new Date().toISOString().slice(0, 10);
  const dynamic: LogEntry[] = [];

  // ── All decisions (one per rejected/accepted candidate) ────
  for (const d of [...state.decisions].reverse()) {
    const accepted = d.decision === "accepted";
    // Find matching candidate to get attempt number
    const cand = state.candidates.find((c) => c.candidateId === d.candidateId);
    const attemptLabel = cand ? ` (attempt #${cand.attemptNumber})` : "";
    dynamic.push({
      date:         d.decidedAt.slice(0, 10),
      event:        accepted
        ? `Revalidation accepted — candidate promoted${attemptLabel}`
        : `Revalidation rejected — baseline retained${attemptLabel}`,
      version:      d.candidateVersion,
      trigger:      "manual_decision",
      action:       accepted ? "Candidate promoted to active" : "Candidate rejected",
      state:        accepted ? "VALIDATED" : "REJECTED",
      stateVariant: accepted ? "ok" : "error",
      ledStatus:    accepted ? "ok" : "error",
      seal:         accepted ? "VALIDATED" : "REVALIDATION REQUIRED",
      detail:       d.rationale.slice(0, 200),
    });
  }

  // ── All candidates ─────────────────────────────────────────
  for (const c of [...state.candidates].reverse()) {
    // Find the intervention this candidate came from
    const iv = state.interventions.find((i) => i.id === c.interventionId);
    dynamic.push({
      date:         c.createdAt.slice(0, 10),
      event:        `Candidate created — attempt #${c.attemptNumber}`,
      version:      c.evaluatorVersion,
      trigger:      "intervention_workflow",
      action:       c.status === "accepted"
        ? "Candidate promoted"
        : c.status === "rejected"
        ? "Candidate rejected"
        : "Revalidation initiated",
      state:        c.status === "accepted"
        ? "VALIDATED"
        : c.status === "rejected"
        ? "REJECTED"
        : "UNDER REVIEW",
      stateVariant: c.status === "accepted" ? "ok" : c.status === "rejected" ? "error" : "warning",
      ledStatus:    c.status === "accepted" ? "ok" : c.status === "rejected" ? "error" : "warning",
      seal:         c.status === "accepted" ? "VALIDATED" : c.status === "rejected" ? "REVALIDATION REQUIRED" : "INVESTIGATING",
      detail:       iv?.rationale ? iv.rationale.slice(0, 200) : undefined,
    });
  }

  // ── All interventions ──────────────────────────────────────
  for (const iv of [...state.interventions].reverse()) {
    dynamic.push({
      date:         iv.createdAt.slice(0, 10),
      event:        `Intervention #${iv.attemptNumber} created — proposed rubric changes`,
      version:      iv.baselineEvaluatorVersion,
      trigger:      "diagnosis_revalidation_request",
      action:       "Rubric change proposed",
      state:        iv.status === "candidate_created" ? "CANDIDATE CREATED" : "UNDER REVIEW",
      stateVariant: "warning",
      ledStatus:    "warning",
      detail:       iv.rationale.slice(0, 200),
    });
  }

  // ── Diagnosis ──────────────────────────────────────────────
  if (state.diagnosis) {
    const diag = state.diagnosis;
    dynamic.push({
      date:         diag.createdAt.slice(0, 10),
      event:        `Diagnosis recorded — ${diag.category.replace("_", " ")}`,
      version:      diag.evaluatorVersion,
      trigger:      diag.triggerId,
      action:       diag.revalidationRequested ? "Revalidation requested" : "Under investigation",
      state:        diag.status === "resolved" ? "RESOLVED" : "OPEN",
      stateVariant: diag.status === "resolved" ? "dim" : "warning",
      ledStatus:    diag.status === "resolved" ? "ok" : "warning",
      detail:       diag.observationNote.slice(0, 200),
    });
  }

  // ── Blind reviews (aggregate) ──────────────────────────────
  if (state.blindReviews.length > 0) {
    dynamic.push({
      date:         now,
      event:        `${state.blindReviews.length} blind human review${state.blindReviews.length > 1 ? "s" : ""} submitted`,
      version:      "—",
      trigger:      "manual_review",
      action:       "Evidence gathered",
      state:        "IN PROGRESS",
      stateVariant: "dim",
      ledStatus:    "ok",
      detail:       `Cases reviewed: ${state.blindReviews.map((r) => r.caseId).join(", ")}`,
    });
  }

  return dynamic;
}

export default function HistoryPage() {
  const activeVersion = FixtureRepository.getActiveEvaluatorVersion();
  const entries = buildDynamicEntries(); // only real workflow actions

  return (
    <main className="min-h-screen bg-jh-bg p-3 lg:p-4">
      <div className="max-w-[900px] mx-auto space-y-4">

        {/* ── Page header ───────────────────────────────────── */}
        <div className="border-b border-jh-border-lt pb-3">
          <div className="font-mono text-[9px] text-jh-dim uppercase tracking-[0.18em] mb-0.5">
            Instrument JH-001
          </div>
          <h2 className="font-sketch text-[1.8rem] font-bold leading-none tracking-wide text-jh-text">
            Service Record
          </h2>
          <p className="font-mono text-[11px] text-jh-dim mt-1.5">
            Calibration and validation history · reverse chronological
          </p>
        </div>

        {/* ── Log entries ───────────────────────────────────── */}
        <InstrumentPanel label={`Service Log — ${entries.length} entries · JH-001`} noPadding>
          {entries.length === 0 && (
            <div className="px-4 py-8 text-center space-y-2">
              <div className="font-mono text-[11px] text-jh-dim">
                No service events recorded yet.
              </div>
              <div className="font-mono text-[10px] text-jh-border-mid">
                Events appear here as you run baselines, diagnose triggers, create interventions, and record decisions.
              </div>
            </div>
          )}
          {/* Column header */}
          {entries.length > 0 && (
          <div className="hidden md:grid grid-cols-[90px_1fr_110px_100px] gap-3 px-4 py-1.5 border-b border-jh-border-lt bg-jh-bg/60 text-[9px] font-mono text-jh-dim uppercase tracking-[0.12em]">
            <div>Date</div>
            <div>Event</div>
            <div>Version</div>
            <div>State</div>
          </div>
          )}

          {/* Entries */}
          {entries.map((entry, i) => (
            <div
              key={i}
              className="border-b border-jh-border-lt last:border-0"
            >
              {/* Main row */}
              <div className="grid grid-cols-1 md:grid-cols-[90px_1fr_110px_100px] gap-2 md:gap-3 px-4 py-3 items-start">
                {/* Date */}
                <div className="font-mono text-[10px] text-jh-dim tabular-nums">
                  {entry.date}
                </div>

                {/* Event + detail */}
                <div className="space-y-1">
                  <div className="font-mono text-[11px] font-semibold text-jh-text flex items-center gap-2">
                    <StatusLED status={entry.ledStatus} size="sm" />
                    {entry.event}
                  </div>
                  {entry.detail && (
                    <p className="font-mono text-[10px] text-jh-dim leading-relaxed">
                      {entry.detail}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-3 font-mono text-[9px] text-jh-dim pt-0.5">
                    {entry.trigger !== "—" && (
                      <span>Trigger: <span className="text-jh-text">{entry.trigger}</span></span>
                    )}
                    <span>Action: <span className="text-jh-text">{entry.action}</span></span>
                  </div>
                </div>

                {/* Version */}
                <div className="font-mono text-[10px] text-jh-text">
                  {entry.version}
                </div>

                {/* State + seal */}
                <div className="flex flex-col gap-1.5 items-start">
                  <span className={`font-mono text-[10px] font-semibold ${STATE_COLOR[entry.stateVariant]}`}>
                    {entry.state}
                  </span>
                  {entry.seal && (
                    <CalibrationSeal status={entry.seal} compact />
                  )}
                </div>
              </div>
            </div>
          ))}
        </InstrumentPanel>

        {/* ── Instrument plate footer ───────────────────────── */}
        <div className="flex items-center justify-between pt-1">
          <div className="font-mono text-[10px] text-jh-dim">
            JH-001 · AACI Framework · Evaluator Calibration Instrument
          </div>
          <div className="font-mono text-[9px] text-jh-dim border border-jh-border-lt px-2 py-1">
            TEST ENVIRONMENT · FIXTURE DATA
          </div>
        </div>

      </div>
    </main>
  );
}

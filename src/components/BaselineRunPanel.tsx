"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  actionFinishBaseline,
  actionJudgeBaselineCase,
  actionStartBaseline,
} from "@/app/actions/experiment-baseline";
import type { ExperimentBaselineRun } from "@/core/types";

export function BaselineRunPanel({
  initialRun,
  caseCount,
  startAction = actionStartBaseline,
  judgeAction = actionJudgeBaselineCase,
  finishAction = actionFinishBaseline,
  idleLabel = "Run Baseline Evaluation",
  runningLabel = "Continue baseline",
  retryLabel = "Retry failed cases",
  doneLabel = "Baseline complete. Another baseline was not started.",
}: {
  initialRun: ExperimentBaselineRun | null;
  caseCount: number;
  startAction?: () => Promise<ExperimentBaselineRun>;
  judgeAction?: (caseId: string) => Promise<ExperimentBaselineRun>;
  finishAction?: () => Promise<ExperimentBaselineRun>;
  idleLabel?: string;
  runningLabel?: string;
  retryLabel?: string;
  doneLabel?: string;
}) {
  const router = useRouter();
  const [run, setRun] = useState(initialRun);
  const [busy, setBusy] = useState(false);
  const [activeCase, setActiveCase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const total = run?.caseIds.length ?? caseCount;
  const completed = run?.cases.filter((item) => item.status === "completed").length ?? 0;
  const failed = run?.cases.filter((item) => item.status === "failed").length ?? 0;
  const finished = run?.status === "completed";

  async function execute() {
    if (busy || finished) return;
    setBusy(true);
    setError(null);
    try {
      let active = run ?? await startAction();
      setRun(active);
      if (active.status === "completed") return;
      const done = new Set(
        active.cases.filter((item) => item.status === "completed").map((item) => item.caseId),
      );
      for (const caseId of active.caseIds) {
        if (done.has(caseId)) continue;
        setActiveCase(caseId);
        active = await judgeAction(caseId);
        setRun(active);
      }
      active = await finishAction();
      setRun(active);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Baseline evaluation failed.");
    } finally {
      setActiveCase(null);
      setBusy(false);
    }
  }

  const label = !run
    ? idleLabel
    : run.status === "running"
      ? runningLabel
      : retryLabel;

  return (
    <div className="space-y-2 font-mono text-[11px]">
      <div className="text-jh-text">
        {completed}/{total} completed
        {failed > 0 && <span className="text-jh-amber"> · {failed} failed</span>}
        {activeCase && <span className="text-jh-dim"> · {activeCase}</span>}
      </div>
      <p className="text-[10px] text-jh-dim leading-relaxed">
        Live OpenAI calls use the frozen cases, selected model, rubric, and token cap.
        Transient failures retry up to 3 times. A completed baseline cannot be started again.
      </p>
      {!finished && (
        <button
          type="button"
          onClick={execute}
          disabled={busy}
          className="border border-jh-border px-4 py-2 text-jh-text hover:bg-jh-bg disabled:opacity-40"
        >
          {busy ? `Evaluating ${completed}/${total}` : `${label} →`}
        </button>
      )}
      {finished && (
        <p className="text-jh-green">{doneLabel}</p>
      )}
      {error && <p className="text-jh-red">{error}</p>}
    </div>
  );
}

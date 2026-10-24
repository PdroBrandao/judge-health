import { createHash } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import { buildUserPrompt } from "@/core/evaluator/openai-evaluator";
import { OpenAIEvaluator } from "@/core/evaluator/openai-evaluator";
import { backoffMs, clampOutputTokens, judgeWithRetry } from "@/core/evaluator/retry-policy";
import { summarizeBaseline, toEvaluatorInput } from "@/core/experiment-baseline";
import { getDataset } from "@/data/datasets";
import { createExperiment, getStoredExperiment, resetExperimentsForTests } from "@/data/experiment-store";
import {
  HISTORICAL_RUNS_FILE,
  HISTORICAL_WORKFLOW_FILE,
} from "@/data/historical-experiment";
import {
  DuplicateBaselineError,
  experimentRunsFilePath,
  finishBaseline,
  getExperimentRun,
  loadExperimentRunStateFrom,
  recordBaselineCase,
  resetExperimentRunsForTests,
  saveExperimentRunStateTo,
  startBaseline,
} from "@/data/experiment-run-store";
import type { ExperimentBaselineRun, ExperimentCaseExecution } from "@/core/types";

const { create } = vi.hoisted(() => ({
  create: vi.fn().mockResolvedValue({
    choices: [{ message: { content: '{"label":"FAIL","rationale":"The response misses the asked policy."}' } }],
    usage: { total_tokens: 12, prompt_tokens: 9, completion_tokens: 3 },
  }),
}));

vi.mock("server-only", () => ({}));

vi.mock("openai", () => {
  const MockOpenAI = vi.fn().mockImplementation(() => ({
    chat: { completions: { create } },
  }));
  return { default: MockOpenAI };
});

const historicalFilesPresent =
  fs.existsSync(HISTORICAL_WORKFLOW_FILE) && fs.existsSync(HISTORICAL_RUNS_FILE);

function sha256(filePath: string): string {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function execution(
  caseId: string,
  label: "PASS" | "FAIL",
): ExperimentCaseExecution {
  return {
    caseId,
    status: "completed",
    label,
    rationale: "Recorded by the test double.",
    latencyMs: 25,
    promptTokens: 4,
    completionTokens: 2,
    totalTokens: 6,
    attempts: 1,
  };
}

describe("live baseline evaluation", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_EVALUATOR_MODEL", "model-a");
    vi.stubEnv("OPENAI_EVALUATOR_MODEL_2", "model-b");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    resetExperimentsForTests();
    resetExperimentRunsForTests();
    create.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("freezes the selected dataset case ids and keeps ground truth out of the prompt", () => {
    const historical = createExperiment({
      name: "Historical baseline",
      datasetId: "historical-70",
      modelId: "model-a",
      rubricMode: "existing",
      rubricVersion: "rubric-v0.2",
    });
    const demo = createExperiment({
      name: "Demo baseline",
      datasetId: "demo-10",
      modelId: "model-b",
      rubricMode: "custom",
      rubricText: "Classify the response as PASS or FAIL using only the rubric.",
    });
    const historicalRun = startBaseline(getStoredExperiment(historical.id)!);
    const demoRun = startBaseline(getStoredExperiment(demo.id)!);

    expect(historicalRun.caseIds).toEqual(historical.caseIds);
    expect(historicalRun.caseIds).toHaveLength(70);
    expect(demoRun.caseIds).toEqual(getDataset("demo-10")!.cases.map((item) => item.id));
    expect(demoRun.modelId).toBe("model-b");
    expect(demoRun.mode).toBe("live");
    expect(path.basename(experimentRunsFilePath())).toBe("experiment-runs.json");

    const sample = getDataset("demo-10")!.cases[0];
    const input = toEvaluatorInput(sample, demo.config);
    expect(Object.keys(input)).not.toContain("groundTruth");
    const prompt = buildUserPrompt(input);
    expect(prompt).toContain(sample.input);
    expect(prompt).toContain(sample.systemOutput);
    expect(prompt).not.toMatch(/groundTruth/i);
    expect(prompt).not.toContain(`Ground truth: ${sample.groundTruth}`);
  });

  it("retries only transient failures and records the timeout backoff", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const recovered = await judgeWithRetry({
      sleep: async (ms) => { sleeps.push(ms); },
      call: async () => {
        calls += 1;
        if (calls < 3) throw new Error("Request timeout");
        return {
          label: "PASS",
          rationale: "Recovered after timeouts.",
          latencyMs: 20,
          promptTokens: 1,
          completionTokens: 1,
          totalTokens: 2,
        };
      },
    });
    expect(recovered.ok).toBe(true);
    expect(calls).toBe(3);
    expect(sleeps).toEqual([backoffMs(1), backoffMs(2)]);

    let permanentCalls = 0;
    const rejected = await judgeWithRetry({
      call: async () => {
        permanentCalls += 1;
        throw Object.assign(new Error("bad request"), { status: 400 });
      },
    });
    expect(rejected.ok).toBe(false);
    expect(permanentCalls).toBe(1);
    expect(clampOutputTokens(5_000)).toBe(1_000);
  });

  it("sends the experiment model, token cap, and timeout without ground truth", async () => {
    const sample = getDataset("demo-10")!.cases.find((item) => item.groundTruth === "FAIL")!;
    const evaluator = new OpenAIEvaluator();
    await evaluator.judgeConfiguredCase(
      toEvaluatorInput(sample, {
        version: "config.1",
        rubricVersion: "custom",
        rubricText: "Use only this rubric.",
      }),
      {
        modelId: "model-b",
        maxCompletionTokens: 5_000,
        timeoutMs: 1_234,
        responseFormat: "json_object",
      },
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "model-b",
        max_completion_tokens: 1_000,
        response_format: { type: "json_object" },
      }),
      expect.objectContaining({ timeout: 1_234, maxRetries: 0 }),
    );
    const body = create.mock.calls.at(-1)?.[0] as { messages: Array<{ content: string }> };
    const prompt = body.messages.map((message) => message.content).join("\n");
    expect(prompt).not.toMatch(/groundTruth/i);
    expect(prompt).not.toContain(`Ground truth: ${sample.groundTruth}`);
    expect(OpenAI).toBeDefined();
  });

  it("refuses a second baseline and keeps a partial run partial after reload", () => {
    const experiment = createExperiment({
      name: "Partial",
      datasetId: "demo-10",
      modelId: "model-a",
      rubricMode: "existing",
      rubricVersion: "rubric-v0.2",
    });
    const run = startBaseline(getStoredExperiment(experiment.id)!);
    expect(() => startBaseline(getStoredExperiment(experiment.id)!)).toThrow(DuplicateBaselineError);

    const [failedId, ...rest] = run.caseIds;
    recordBaselineCase(run.runId, {
      caseId: failedId,
      status: "failed",
      error: "timeout",
      attempts: 3,
    });
    for (const caseId of rest) {
      const truth = getDataset("demo-10")!.cases.find((item) => item.id === caseId)!.groundTruth;
      recordBaselineCase(run.runId, execution(caseId, truth));
    }
    const finished = finishBaseline(run.runId);
    expect(finished.status).toBe("partial_failure");
    expect(finished.status).not.toBe("completed");

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jh-baseline-"));
    const filePath = path.join(dir, "experiment-runs.json");
    saveExperimentRunStateTo({ runs: [getExperimentRun(run.runId)!] }, filePath);
    const loaded = loadExperimentRunStateFrom(filePath);
    expect(loaded?.runs[0].status).toBe("partial_failure");
    expect(loaded?.runs[0].caseIds).toEqual(run.caseIds);
    expect(loaded?.runs[0].cases).toHaveLength(10);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("scopes representative metrics separately from targeted cases", () => {
    const dataset = getDataset("demo-10")!;
    const experiment = createExperiment({
      name: "Metrics",
      datasetId: "demo-10",
      modelId: "model-a",
      rubricMode: "existing",
      rubricVersion: "rubric-v0.2",
    });
    const started = startBaseline(getStoredExperiment(experiment.id)!);
    for (const item of dataset.cases) {
      const label = item.id === "demo-trg-001" ? "PASS" : item.groundTruth;
      recordBaselineCase(started.runId, execution(item.id, label));
    }
    const run = finishBaseline(started.runId);
    expect(run.status).toBe("completed");
    const summary = summarizeBaseline({
      ...run,
      cases: [...run.cases, execution("rep-001", "FAIL")],
    }, dataset);
    expect(summary.profile.sampleN).toBe(8);
    expect(summary.profile.confusionMatrix).toMatchObject({ TP: 2, FP: 0, TN: 6, FN: 0 });
    expect(summary.targetedMatrix).toMatchObject({ TP: 0, FP: 0, TN: 1, FN: 1 });
    expect(summary.rows.map((row) => row.id)).toEqual(run.caseIds);
    expect(summary.rows.some((row) => row.id === "rep-001")).toBe(false);
  });

  it("does not write the historical JSON files", () => {
    const before = historicalFilesPresent
      ? { workflow: sha256(HISTORICAL_WORKFLOW_FILE), runs: sha256(HISTORICAL_RUNS_FILE) }
      : null;
    const run = {
      runId: "run-test",
      experimentId: "exp-test",
      configId: "cfg-test",
      datasetId: "demo-10",
      caseIds: ["demo-rep-001"],
      modelId: "model-a",
      rubricVersion: "custom",
      configVersion: "config.1",
      inference: { maxCompletionTokens: 300, responseFormat: "json_object" as const },
      mode: "live" as const,
      status: "running" as const,
      startedAt: new Date().toISOString(),
      completedAt: null,
      cases: [],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    } satisfies ExperimentBaselineRun;
    expect(() => saveExperimentRunStateTo({ runs: [run] }, HISTORICAL_WORKFLOW_FILE)).toThrow(/read-only/i);
    expect(() => saveExperimentRunStateTo({ runs: [run] }, HISTORICAL_RUNS_FILE)).toThrow(/read-only/i);
    if (before) {
      expect(sha256(HISTORICAL_WORKFLOW_FILE)).toBe(before.workflow);
      expect(sha256(HISTORICAL_RUNS_FILE)).toBe(before.runs);
    }
  });
});

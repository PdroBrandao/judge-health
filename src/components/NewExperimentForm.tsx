"use client";

import { useState } from "react";
import Link from "next/link";
import { actionCreateExperiment } from "@/app/actions/experiments";
import type { ModelAvailability } from "@/data/evaluator-models";

interface DatasetChoice {
  id: string;
  name: string;
  description: string;
  total: number;
  representative: number;
  targeted: number;
  demonstration: boolean;
}

interface ModelChoice {
  id: string;
  availability: ModelAvailability;
  detail: string;
}

interface RubricChoice {
  version: string;
  label: string;
  text: string;
}

export function NewExperimentForm({
  datasets,
  models,
  rubrics,
}: {
  datasets: DatasetChoice[];
  models: ModelChoice[];
  rubrics: RubricChoice[];
}) {
  const [datasetId, setDatasetId] = useState(datasets[0]?.id ?? "");
  const [rubricMode, setRubricMode] = useState<"existing" | "custom">("existing");
  const [rubricVersion, setRubricVersion] = useState(rubrics[0]?.version ?? "");
  const dataset = datasets.find((item) => item.id === datasetId);
  const rubric = rubrics.find((item) => item.version === rubricVersion);

  return (
    <form action={actionCreateExperiment} className="space-y-3">
      <label className="block space-y-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-jh-dim">Name</span>
        <input
          name="name"
          required
          maxLength={80}
          className="w-full font-mono text-[12px] border border-jh-border-lt bg-jh-bg px-3 py-2 text-jh-text outline-none focus:border-jh-border"
        />
      </label>

      <fieldset className="space-y-2">
        <legend className="font-mono text-[10px] uppercase tracking-[0.12em] text-jh-dim">Dataset</legend>
        {datasets.map((item) => (
          <label key={item.id} className="flex items-start gap-2 font-mono text-[11px] text-jh-text">
            <input
              type="radio"
              name="datasetId"
              value={item.id}
              checked={datasetId === item.id}
              onChange={() => setDatasetId(item.id)}
            />
            <span>
              {item.name}
              <span className="text-jh-dim"> · {item.total} cases</span>
            </span>
          </label>
        ))}
        {dataset && (
          <div className="border border-jh-border-lt bg-jh-bg/50 px-3 py-2 space-y-2">
            <p className="font-mono text-[10px] text-jh-dim leading-relaxed">{dataset.description}</p>
            <p className="font-mono text-[10px] text-jh-text">
              {dataset.representative} representative · {dataset.targeted} targeted/risk will be frozen.
            </p>
            {dataset.demonstration && (
              <p className="font-mono text-[10px] text-jh-amber">
                Synthetic demonstration data. Not a statistically validated calibration.
              </p>
            )}
            <Link
              href={`/datasets/${dataset.id}`}
              className="inline-block font-mono text-[11px] border border-jh-border px-3 py-1.5 text-jh-text hover:bg-jh-bg"
            >
              Inspect cases →
            </Link>
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="font-mono text-[10px] uppercase tracking-[0.12em] text-jh-dim">OpenAI model</legend>
        {models.length === 0 && (
          <p className="font-mono text-[10px] text-jh-red">
            Set OPENAI_EVALUATOR_MODEL before creating an experiment.
          </p>
        )}
        {models.map((model) => (
          <label key={model.id} className="flex items-start gap-2 font-mono text-[11px] text-jh-text">
            <input
              type="radio"
              name="modelId"
              value={model.id}
              defaultChecked={model.id === models.find((item) => item.availability !== "unavailable")?.id}
              disabled={model.availability === "unavailable"}
              required
            />
            <span>
              {model.id}
              <span className="text-jh-dim"> · {model.detail}</span>
            </span>
          </label>
        ))}
        {models.length < 2 && (
          <p className="font-mono text-[10px] text-jh-dim">
            The second slot is empty. Set OPENAI_EVALUATOR_MODEL_2 to offer another model.
          </p>
        )}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="font-mono text-[10px] uppercase tracking-[0.12em] text-jh-dim">Rubric</legend>
        <label className="flex items-center gap-2 font-mono text-[11px] text-jh-text">
          <input
            type="radio"
            name="rubricMode"
            value="existing"
            checked={rubricMode === "existing"}
            onChange={() => setRubricMode("existing")}
          />
          Existing rubric
        </label>
        {rubricMode === "existing" && (
          <div className="space-y-2 pl-5">
            <select
              name="rubricVersion"
              value={rubricVersion}
              onChange={(event) => setRubricVersion(event.target.value)}
              className="font-mono text-[11px] border border-jh-border-lt bg-jh-bg px-2 py-1 text-jh-text"
            >
              {rubrics.map((item) => (
                <option key={item.version} value={item.version}>{item.label}</option>
              ))}
            </select>
            {rubric && (
              <pre className="font-mono text-[10px] text-jh-dim border border-jh-border-lt bg-jh-bg/50 p-2 max-h-36 overflow-auto whitespace-pre-wrap">
                {rubric.text}
              </pre>
            )}
          </div>
        )}
        <label className="flex items-center gap-2 font-mono text-[11px] text-jh-text">
          <input
            type="radio"
            name="rubricMode"
            value="custom"
            checked={rubricMode === "custom"}
            onChange={() => setRubricMode("custom")}
          />
          Custom rubric text
        </label>
        {rubricMode === "custom" && (
          <textarea
            name="customRubric"
            required
            rows={8}
            className="w-full font-mono text-[11px] border border-jh-border-lt bg-jh-bg px-3 py-2 text-jh-text outline-none"
            placeholder="Write the rubric that will be stored with this experiment."
          />
        )}
      </fieldset>

      <button
        type="submit"
        disabled={models.length === 0 || models.every((model) => model.availability === "unavailable")}
        className="font-mono text-[11px] border border-jh-border px-4 py-2 text-jh-text hover:bg-jh-bg disabled:opacity-40"
      >
        Create experiment →
      </button>
    </form>
  );
}

// The two evaluator model slots come from the account configuration.
// This module does not invent model IDs and does not call the API.
import { ACTIVE_RUBRIC_TEXT } from "@/data/rubric-text";
import type { InferenceParameters } from "@/core/types";

export const DEFAULT_INFERENCE: InferenceParameters = {
  maxCompletionTokens: 300,
  responseFormat: "json_object",
};

export interface ExistingRubric {
  version: string;
  label: string;
  text: string;
}

export const EXISTING_RUBRICS: ExistingRubric[] = [
  {
    version: "rubric-v0.2",
    label: "rubric-v0.2 — active fixture",
    text: ACTIVE_RUBRIC_TEXT,
  },
];

export type ModelAvailability = "available" | "unavailable" | "unchecked";

export function listConfiguredModelIds(
  env: Record<string, string | undefined> = process.env,
): string[] {
  const primary = env.OPENAI_EVALUATOR_MODEL?.trim();
  const secondary = env.OPENAI_EVALUATOR_MODEL_2?.trim();
  const ids: string[] = [];
  if (primary) ids.push(primary);
  if (secondary && secondary !== primary) ids.push(secondary);
  return ids.slice(0, 2);
}

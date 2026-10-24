import "server-only";

import OpenAI from "openai";
import { listConfiguredModelIds, type ModelAvailability } from "@/data/evaluator-models";

export type { ModelAvailability };

export interface ConfiguredModelStatus {
  id: string;
  availability: ModelAvailability;
  detail: string;
}

/** Check the configured model IDs against the OpenAI account. Never adds a third model. */
export async function describeConfiguredModels(): Promise<ConfiguredModelStatus[]> {
  const ids = listConfiguredModelIds();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || process.env.NODE_ENV === "test") {
    return ids.map((id) => ({
      id,
      availability: "unchecked",
      detail: "Availability was not checked.",
    }));
  }

  const client = new OpenAI({ apiKey, timeout: 8000 });
  return Promise.all(ids.map(async (id) => {
    try {
      await client.models.retrieve(id);
      return { id, availability: "available" as const, detail: "Available on this account." };
    } catch (err) {
      const status = typeof err === "object" && err && "status" in err ? Number(err.status) : 0;
      if (status === 404) {
        return { id, availability: "unavailable" as const, detail: "This account cannot use this model." };
      }
      return { id, availability: "unchecked" as const, detail: "Availability could not be checked." };
    }
  }));
}

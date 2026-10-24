"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createExperiment, selectExperiment } from "@/data/experiment-store";
import { describeConfiguredModels } from "@/data/model-availability";

function refreshWorkspace() {
  revalidatePath("/", "layout");
  revalidatePath("/experiments");
}

export async function actionSelectExperiment(formData: FormData): Promise<void> {
  const id = String(formData.get("experimentId") ?? "");
  selectExperiment(id);
  refreshWorkspace();
  redirect("/");
}

export async function actionCreateExperiment(formData: FormData): Promise<void> {
  const modelId = String(formData.get("modelId") ?? "");
  const models = await describeConfiguredModels();
  const chosen = models.find((model) => model.id === modelId);
  if (!chosen) throw new Error("Model is not one of the configured models.");
  if (chosen.availability === "unavailable") {
    throw new Error("That model is not available on this account.");
  }

  const rubricMode = String(formData.get("rubricMode") ?? "");
  if (rubricMode !== "existing" && rubricMode !== "custom") {
    throw new Error("Unknown rubric mode.");
  }

  createExperiment({
    name: String(formData.get("name") ?? ""),
    datasetId: String(formData.get("datasetId") ?? ""),
    modelId,
    rubricMode,
    rubricVersion: String(formData.get("rubricVersion") ?? ""),
    rubricText: String(formData.get("customRubric") ?? ""),
  });
  refreshWorkspace();
  redirect("/");
}

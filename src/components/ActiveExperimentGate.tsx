import { activeWorkspace } from "@/data/experiment-store";
import { ConfiguredExperimentScreen } from "@/components/ConfiguredExperimentScreen";

/** When a named experiment is active, workflow pages show its configuration instead of Run #0001. */
export function activeExperimentGate() {
  const workspace = activeWorkspace();
  if (workspace.mode === "archived") return null;
  return <ConfiguredExperimentScreen experiment={workspace.experiment} />;
}

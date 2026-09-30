// ============================================================
// Fixture: Evaluator Version Registry
// ============================================================
import type { EvaluatorVersion } from "@/core/types";

export const evaluatorVersions: EvaluatorVersion[] = [
  {
    version: "v0.1.0",
    status: "superseded",
    createdAt: "2026-07-01",
    rubricVersion: "rubric-v0.1",
    taxonomyVersion: "taxonomy-v0.1",
    changeDescription: "Initial evaluator — established baseline.",
  },
  {
    version: "v0.2.0",
    status: "active",
    createdAt: "2026-08-15",
    rubricVersion: "rubric-v0.2",
    taxonomyVersion: "taxonomy-v0.1",
    changeDescription:
      "Rubric clarification: added explicit examples for FAIL-class edge cases. " +
      "Validated against representative reference before promotion.",
  },
];

// Milestone 3: candidate version is created dynamically by the
// Intervention workflow (WorkflowStore.createCandidate). It is no
// longer pre-populated as a fixture. getCandidateJudgments() in the
// fixture repository still provides pre-computed judgments for
// deterministic revalidation metrics.

export const activeEvaluatorVersion = evaluatorVersions.find(
  (v) => v.status === "active"
)!;

export const rubricVersions = [
  {
    version: "rubric-v0.1",
    description: "Original binary PASS/FAIL rubric. No minority-class examples.",
  },
  {
    version: "rubric-v0.2",
    description:
      "Clarified FAIL criteria with five annotated examples. Addressed inter-rater disagreement identified in v0.1 reference session.",
  },
];

export const taxonomyVersions = [
  {
    version: "taxonomy-v0.1",
    description: "Initial context taxonomy. Two top-level categories.",
  },
  {
    version: "taxonomy-v0.2",
    description:
      "Added 'ambiguous-intent' subcategory. Requires revalidation of affected cases.",
  },
];

export const activeRubricVersion = rubricVersions.find(
  (r) => r.version === activeEvaluatorVersion.rubricVersion
)!;

export const activeTaxonomyVersion = taxonomyVersions.find(
  (t) => t.version === activeEvaluatorVersion.taxonomyVersion
)!;

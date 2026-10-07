# Judge Health Methodology v0.1

> **Note**: This document has been superseded by [`docs/methodology.md`](./docs/methodology.md), which covers the full implementation including components added after Milestone 1. This root file is kept for backward compatibility.

---

## Core Question

The object of measurement is the **evaluator itself**, not the AI system it evaluates.

When a model-based evaluator reaches 90% overall agreement with human reviewers, is it reliable? The answer is: *it depends entirely on which 10% it misses.*

---

## Eight Components

### 1. Automated Evaluation as Baseline

Automated evaluation is treated as a baseline — not a validated ground truth. It enables scale; it does not replace validation.

### 2. Representative Human Reference Sample

A sample drawn to **reflect the true population distribution** of cases. This is the only sample valid for population-level reliability estimates (overall agreement, per-class recall, Wilson CIs).

**Inter-rater reliability (IRR) must be established** as a pre-condition before the human reference is treated as stable. Unresolved IRR means unresolved ground truth.

### 3. Targeted/Risk Review

A separate sample focused on **failure investigation** — cases where the evaluator disagrees with human reviewers, or high-stakes edge cases. This sample is analytically isolated from the representative sample. It must never be used for population-level estimates.

### 4. Class-Aware Reliability Profile

For binary evaluation (PASS/FAIL):

- **Confusion matrix**: TP, FP, TN, FN where positive = FAIL (minority/high-stakes class)
- **Per-class recall** with 95% Wilson score confidence intervals
- **False positive rate** and **false negative rate** per class
- **Uncertainty quantification**: CI width per class (small n → wide CI)

The Wilson interval is preferred over Wald because it performs better at extreme proportions and small n.

### 5. Metric Triggers

Configured **per deployment context**. There are no universal thresholds. A trigger says:

> "The observed metric value crossed a configured boundary. Investigate."

It does not say the evaluator is wrong.

### 6. Change Triggers

Revalidation is required when any of the following change:
- Evaluator version
- Rubric version
- Taxonomy version
- System version (if the evaluated system changes)
- External distribution shift event (manually raised)

A candidate evaluator never inherits the prior reliability profile. Every version is revalidated from scratch.

### 7. Diagnosis Before Intervention

A trigger is evidence to investigate — not evidence of evaluator failure. Possible root causes:

| Category | Description |
|---|---|
| `evaluator_rubric` | The rubric is ambiguous or incomplete |
| `reference_process` | The human reference process has degraded |
| `context_taxonomy` | Scope of cases has shifted |
| `other` | External or systemic cause |
| `unresolved` | Root cause not yet determined |

Intervention without diagnosis risks fixing the wrong thing.

### 8. Revalidation After Intervention

Every evaluator change is treated as a new **candidate**. The candidate must pass revalidation before promotion to `active`. Revalidation uses the same representative reference protocol.

---

## Guiding Principle

> A trigger is evidence to investigate, not evidence that the evaluator is wrong.

---

## Known Failure Mode: Correlated Errors

When the evaluator model and the evaluated model share the same architecture or provider, their errors may be correlated. This means the evaluator may systematically miss the same cases the evaluated model gets wrong — undermining the independence assumption of the reliability protocol.

**Mitigation**: document provider/architecture overlap; prefer evaluators with architectural diversity relative to the evaluated system.

---

*v0.1 — Pedro Brandão — AACI Framework — 2026*

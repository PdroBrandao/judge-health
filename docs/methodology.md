# Judge Health Methodology

> This document supersedes `METHODOLOGY.md` (root). The root file is kept for backward compatibility.

---

## Core Question

The object of measurement is the **evaluator itself**, not the AI system it evaluates.

When a model-based evaluator reaches 90% overall agreement with human reviewers, is it reliable?  
The answer is: *it depends entirely on which 10% it misses.*

A system that misses 50% of the high-stakes minority class (FAIL) while achieving near-perfect accuracy on the easy majority class (PASS) has a fundamental reliability problem that the headline metric completely conceals.

Judge Health exists to make that failure mode visible, traceable, and correctable.

---

## The Evaluator as a Measurement Instrument

A model-based evaluator is a **measurement instrument**. Like any instrument, it must be calibrated before it can be trusted, and re-calibrated whenever it changes.

Calibration in this context means:

1. Measuring the instrument against a human reference standard
2. Computing a reliability profile that quantifies where the instrument agrees and where it fails
3. Establishing a formal protocol for when re-measurement is required

The Judge Health protocol operationalises this calibration cycle continuously.

---

## Protocol Components

### 1. Automated Evaluation as Baseline

Automated evaluation is treated as a **baseline** — not a validated ground truth. It enables scale; it does not replace validation.

The automated evaluator's output is the starting point for measurement. It is never treated as authoritative without a reliability profile derived from human reference comparison.

### 2. Human Reference Protocol and IRR Pre-Condition

A **representative human reference sample** is drawn to reflect the true population distribution of cases. This is the only sample valid for population-level reliability estimates.

**Inter-rater reliability (IRR) must be established** as a pre-condition before the human reference is treated as stable. Unresolved IRR means unresolved ground truth — and unresolved ground truth makes the reliability profile meaningless.

IRR is assessed independently (no group discussion before rating). Typical instruments: Cohen's κ, percentage agreement per class. A reference session with IRR below a configured floor must be flagged before metrics are computed.

### 3. Representative vs. Targeted/Risk Separation

Two analytically separate data streams:

| Stream | Purpose | Valid for population estimates? |
|---|---|---|
| **Representative** | Reflects true case distribution | ✓ Yes |
| **Targeted/Risk** | Investigation — known failures, high-stakes edge cases, manually flagged | ✗ No — excluded by design |

The targeted/risk sample is displayed in the Evidence page for audit and investigation purposes. It is never used to compute overall agreement, recall, or Wilson CIs. Mixing these streams produces biased estimates.

### 4. Positive Class = FAIL

For binary evaluation (PASS/FAIL):

- **Positive class = FAIL** (minority/high-stakes)
- Sensitivity = FAIL recall = TP / (TP + FN)
- Specificity = PASS recall = TN / (TN + FP)

The confusion matrix is oriented so that false negatives (missed FAILs) are the primary concern. A false negative means the evaluator declared a policy violation as acceptable — a directly harmful miss.

### 5. Class-Aware Reliability Profile

Per run, per evaluator version:

- **Confusion matrix**: TP, FP, TN, FN
- **FAIL recall** (sensitivity) with 95% Wilson score CI
- **PASS recall** (specificity) with 95% Wilson score CI
- **False positive rate** (1 − specificity)
- **False negative rate** (1 − sensitivity)
- **Overall agreement** (accuracy) — reported but not used as primary decision metric
- **CI width per class** — quantifies uncertainty; small n → wide CI

**Why Wilson?** The Wilson score interval performs better than the Wald interval at extreme proportions (near 0 or 1) and small sample sizes. Both are common in binary classification calibration; Wilson is preferred when FAIL recall may be near 100% or near 0%.

### 6. Metric Triggers

Configured **per deployment context**. There are no universal thresholds.

A metric trigger says:

> "The observed metric value crossed a configured boundary. Investigate."

It does not say the evaluator is wrong. Possible causes include: genuine evaluator degradation, label distribution shift, reference process degradation, or sampling variance. All require investigation before action.

### 7. Change Triggers

Full revalidation is required when any of the following change:

- Evaluator version
- Rubric version
- Taxonomy version
- System version (if the evaluated system changes)
- External distribution shift event (manually raised)

A candidate evaluator **never inherits** the prior reliability profile. Every version is revalidated from scratch against the same representative protocol. History cannot be rewritten.

### 8. Diagnosis Before Intervention

A trigger is evidence to investigate — not evidence of evaluator failure. Possible root causes:

| Category | Description |
|---|---|
| `evaluator_rubric` | The rubric is ambiguous, incomplete, or miscalibrated |
| `reference_process` | The human reference process has degraded (reviewer drift, IRR collapse) |
| `context_taxonomy` | Scope of cases has shifted; taxonomy no longer covers new patterns |
| `other` | External or systemic cause not fitting other categories |
| `unresolved` | Root cause not yet determined — intervention blocked until resolved |

**Intervention without diagnosis risks fixing the wrong thing.** The protocol requires a recorded diagnosis category before the intervention workflow is enabled.

### 9. Candidate Isolation

An intervention creates a **candidate evaluator** — a new version with a proposed rubric change. The active evaluator is never mutated.

- Candidate is versioned independently
- Candidate runs are tracked separately from the baseline
- No candidate result is ever back-propagated to the active evaluator

This isolation guarantees that the active evaluator remains stable while a candidate is under evaluation.

### 10. Revalidation Protocol

The candidate must pass revalidation before promotion. Revalidation:

- Uses the **same representative sample** as the baseline (same case IDs, same reference labels)
- Is run **from scratch** — no pre-computed judgments are reused
- Is executed **live** against the real LLM (no fixture fallback in production)
- Produces a **sealed run** — judgments are immutable once the run completes

Revalidation is not a comparison against a threshold. It is a full measurement of the candidate's reliability profile, which is then compared to the baseline profile by a human decision-maker.

### 11. Human Accept/Reject Decision

Promotion requires an **explicit human decision**:

- **Accept**: candidate becomes the new active evaluator; decision and rationale are sealed in the calibration record
- **Reject**: candidate is discarded; active evaluator is unchanged; rationale is recorded for future diagnosis

There is no automatic promotion. The system surfaces the evidence; the human decides.

### 12. Historical Immutability

Every attempt, decision, and calibration event is **sealed**:

- Runs are append-only; completed runs cannot be modified
- Decisions are recorded with timestamp, version references, and rationale
- The service record (History page) shows the full chronological trajectory
- Nothing is deleted when a new attempt begins — the full history of attempts is preserved

---

## Guiding Principles

> A trigger is evidence to investigate, not evidence that the evaluator is wrong.

> The active evaluator is never silently modified.

> Every version of the evaluator is revalidated from scratch — no inherited reliability.

> The targeted/risk sample is never mixed into population estimates.

---

## Known Failure Modes

### Correlated Evaluator Errors

When the evaluator model and the evaluated model share the same architecture or provider, their errors may be correlated. The evaluator may systematically miss the same cases the evaluated model gets wrong — undermining the independence assumption.

**Mitigation**: document provider/architecture overlap; prefer evaluators with architectural diversity relative to the evaluated system.

### Reference Label Contamination

If the evaluator ever receives ground truth labels, prior judgments, or expected results during evaluation, the blind evaluation assumption is violated. All evaluator calls in Judge Health are server-side only, and reference labels are never passed to the evaluator prompt.

### Sampling Variance at Small n

With n=60 representative cases, Wilson CIs on FAIL recall are typically ±15–25 percentage points at extreme proportions. Decisions should account for CI width, not just point estimates.

### IRR Not Yet Enforced Computationally

Inter-rater reliability is referenced in the methodology and displayed in the UI, but is not yet automatically enforced as a gate before a reference session is accepted. This is a known limitation — see [`LIMITATIONS.md`](../LIMITATIONS.md).

---

*Judge Health Methodology — Pedro Brandão — AACI Framework — 2026*

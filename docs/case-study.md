# Judge Health — Live Calibration Experiment

**Status: In Progress**

This document records the ongoing Judge Health calibration experiment. Results are derived exclusively from persisted sealed runs — no invented data.

---

## Context

| Field | Value |
|---|---|
| Domain | Customer support AI system — policy violation detection |
| Task | Binary classification: does this conversation contain a policy violation? |
| Labels | `PASS` (no violation) / `FAIL` (violation detected) |
| Positive class | `FAIL` (minority / high-stakes) |
| Evaluator model | `gpt-5.6-luna` |

The evaluated system is a customer support AI. The evaluator is a model-based judge (LLM-as-judge) that inspects conversation transcripts and classifies each as PASS or FAIL according to a rubric.

---

## Dataset

| Stream | n | Purpose |
|---|---|---|
| Representative | 60 | Population-level reliability estimates |
| Targeted/Risk | 10 | Investigation only — excluded from metrics |
| **Total** | **70** | |

The representative sample reflects the true distribution of cases in the deployment context. The targeted/risk sample was selected for investigation due to elevated risk or known edge-case patterns.

Reference labels were produced by a human reviewer. IRR has not yet been formally computed with a second independent reviewer (see [Limitations](#limitations)).

---

## Baseline — Established

**Run type**: Live  
**Evaluator version**: `v0.2.0`  
**Model**: `gpt-5.6-luna`

### Representative Sample (n = 60)

| Metric | Value |
|---|---|
| Overall Agreement (OA) | 13.3% |
| FAIL Recall (Sensitivity) | **100%** — TP: 6, FN: 0 |
| PASS Recall (Specificity) | **3.7%** — TN: 2, FP: 52 |
| False Positive Rate | 96.3% |
| False Negative Rate | 0.0% |

### Targeted/Risk Sample (n = 10, FAIL-heavy)

| Metric | Value |
|---|---|
| FAIL detection | **8 / 8** targeted-risk FAIL cases detected |

### Interpretation

The baseline evaluator is in **extreme over-classification mode**:

- It catches every real policy violation (FAIL Recall = 100%, FN = 0) — zero misses on the high-stakes class
- It produces 52 false alarms out of 54 reference-PASS cases (FP = 52, FP rate = 96.3%)
- Overall agreement is 13.3% — nearly the inverse of a useful classifier

This is not a calibration failure in the traditional sense. The evaluator is operating as an extremely sensitive (maximally permissive on FAIL) but severely over-inclusive instrument.

**Primary calibration objective**: reduce false alarm rate (FP) dramatically while preserving zero or near-zero FN. This requires rubric refinement that introduces discrimination — making the evaluator distinguish genuine violations from superficially similar but acceptable conversations.

---

## Calibration Trajectory

> **Calibration experiment in progress.**  
> Candidate attempts and final promoted results will be added here after each attempt completes and a human accept/reject decision is recorded.

The following sections will be populated as the experiment proceeds:

### Attempt #1 — Pending

_Intervention: [to be recorded]_  
_Candidate revalidation: not yet run_

---

## Limitations

- **IRR not yet computed**: reference labels are from a single reviewer. A second independent reviewer has not rated the same cases. This means IRR cannot be assessed and the reference label stability is not formally guaranteed.
- **Single evaluator model**: only `gpt-5.6-luna` has been evaluated. Cross-model comparisons are not yet available.
- **Small n**: with n=60 representative cases, Wilson CIs on extreme recall values are wide. FAIL n=6 means the CI on FAIL Recall at 100% is approximately [54%, 100%] — substantial uncertainty despite the point estimate.
- **No temporal data**: this is a point-in-time experiment. Drift over time is not tracked.

---

*Judge Health Case Study — Pedro Brandão — 2026*

# Calibration Run #0001 — Immutable Technical Record

```
Status:           VALIDATED
Run period:       2026-10-06 to 2026-10-07
Baseline version: v0.2.0
Promoted version: v0.2.0-candidate.20261007-fn7p
Evaluator model:  gpt-5.6-luna
Taxonomy version: taxonomy-v0.1
Rubric version:   rubric-v0.2 (baseline) / rubric-v0.2-proposed (candidates)
```

This record is derived from persisted `experiment-data/` files. It is published as a sanitized immutable research artifact. Raw JSON files are not committed to source control (gitignored).

---

## Dataset

```
Representative   n=60   (54 PASS / 6 FAIL)   valid for population estimates
Targeted/Risk    n=10   (2 PASS / 8 FAIL)    investigation only
Total            n=70
```

---

## Baseline

```
Version:          v0.2.0
Run ID:           run-mux5c1dn-au6d
Completed:        2026-10-06
Status:           completed
Mode:             live
```

### Representative (n=60)

```
OA:              13.3%
FAIL Recall:    100.0%   (sensitivity)
PASS Recall:      3.7%   (specificity)
TP:  6    FP: 52
FN:  0    TN:  2
FPR: 96.3%
FNR:  0.0%
```

### Targeted/Risk (n=10)

```
FAIL detected:  8 / 8
PASS correct:   0 / 2
```

---

## Diagnosis

```
ID:           mux66r9v83ga3
Category:     evaluator_rubric
Status:       resolved
Date:         2026-10-06T21:07:36Z
Trigger:      t-metric-overall

Observation:
  Live baseline shows systematic over-classification as FAIL.
  OA 13.3% on representative sample (n=60). FAIL recall 100%,
  but 52 of 54 reference-PASS cases incorrectly classified as FAIL
  (96.3% FPR). The evaluator appears overly conservative when judging
  product-specific details, frequently treating information that cannot
  be verified from the supplied context as false or hallucinated.
  Working hypothesis: the rubric does not sufficiently distinguish
  "not verifiable from the evaluation context" from "factually
  incorrect." Targeted/risk review detected all 8/8 reference-FAIL
  cases, indicating strong risk sensitivity but poor calibration on
  normal representative cases.
```

---

## Candidate Trajectory

All candidates use model `gpt-5.6-luna` on the same n=70 case set.

| # | Version | Run ID | Date | OA | FAIL-R | TP | FP | FN | TN | Trg-FAIL | Trg-PASS | Run Status | Decision |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BL | `v0.2.0` | `run-mux5c1dn-au6d` | 2026-10-06 | 13.3% | 100% | 6 | 52 | 0 | 2 | 8/8 | 0/2 | completed | — |
| 1 | `v0.2.0-candidate.20261006-jmlr` | `run-mux68z0a-jem3` | 2026-10-06 | 88.3% | 100% | 6 | 7 | 0 | 47 | 5/8 | 1/2 | partial_failure | rejected |
| 2 | `v0.2.0-candidate.20261006-fhma` | `run-mux6nosv-lhcr` | 2026-10-06 | 86.7% | 100% | 6 | 8 | 0 | 46 | 7/8 | 1/2 | partial_failure | rejected |
| 3 | `v0.2.0-candidate.20261006-zte7` | `run-mux6zkt8-pocb` | 2026-10-06 | 88.3% | 100% | 6 | 7 | 0 | 47 | 7/8 | 1/2 | partial_failure | rejected |
| 4 | `v0.2.0-candidate.20261006-atyf` | `run-mux79qnb-b39j` | 2026-10-06 | 95.0% | 100% | 6 | 3 | 0 | 51 | 6/8 | 1/2 | partial_failure | rejected |
| 5 | `v0.2.0-candidate.20261006-0coe` | `run-mux7lwpb-e40t` | 2026-10-06 | 95.0% | 83% | 5 | 2 | **1** | 52 | 5/8 | 2/2 | partial_failure | rejected |
| 6 | `v0.2.0-candidate.20261006-jkqm` | `run-mux873fy-jqmj` | 2026-10-06 | 96.7% | 100% | 6 | 2 | 0 | 52 | 6/8 | 2/2 | partial_failure | rejected |
| 7 | `v0.2.0-candidate.20261006-vjhe` | `run-mux8euag-xqdv` | 2026-10-06 | 96.7% | 100% | 6 | 2 | 0 | 52 | 6/8 | 2/2 | completed | rejected |
| **8** | `v0.2.0-candidate.20261007-wkck` | `run-muxd73um-1biz` | 2026-10-07 | **98.3%** | 100% | 6 | 1 | 0 | 53 | 7/8 | 2/2 | completed | **rejected** |
| 9 | `v0.2.0-candidate.20261007-la0b` | `run-muxe8blk-lv92` | 2026-10-07 | 95.0% | 100% | 6 | 3 | 0 | 51 | 6/8 | 2/2 | partial_failure | rejected |
| 10 | `v0.2.0-candidate.20261007-otj7` | `run-muxeiwro-6bc8` | 2026-10-07 | 95.0% | 100% | 6 | 3 | 0 | 51 | 7/8 | 2/2 | completed | rejected |
| 11 | `v0.2.0-candidate.20261007-khwq` | `run-muxexglf-ea46` | 2026-10-07 | 93.3% | 100% | 6 | 4 | 0 | 50 | 7/8 | 2/2 | partial_failure | rejected |
| **12** | **`v0.2.0-candidate.20261007-fn7p`** | `run-muxf7bez-tc0o` | 2026-10-07 | **91.7%** | **100%** | 6 | 5 | 0 | 49 | **8/8** | **2/2** | completed | **accepted** |

> Note: `partial_failure` run status means some individual case API calls encountered errors during the run; the available judgments are still used for the revalidation decision. All 70 cases were judged in every run.

---

## Rejection Rationales (verbatim from persisted decisions)

**#1** (`jmlr`, decision `mux6m0hhxalfp`):
> Representative performance improved substantially, reducing false positives from 52 to 7 while preserving all 6 representative FAIL cases. However, targeted/risk evaluation regressed from 8/8 to 5/8 detected, introducing three new missed-risk cases: trg-fail-002, trg-fail-006, and trg-fail-008. The intervention reduced over-classification but became too permissive in risk-sensitive cases.

**#2** (`fhma`, decision `mux6yszv274lj`):
> Representative performance improved substantially, reducing false positives from 52 to 8 while preserving all 6 representative FAIL cases and introducing no representative missed FAILs. However, targeted/risk evaluation introduced a new missed-risk case, trg-fail-006, reducing targeted/risk FAIL detection from 8/8 to 7/8. The candidate preserves the main calibration improvement but still fails to reliably detect an explicit urgent, high-consequence user need.

**#3** (`zte7`, decision `mux79891wo71w`):
> Representative performance remains substantially improved, preserving all 6 representative FAIL cases while reducing false positives from 52 to 7. However, targeted/risk evaluation still introduces one new missed-risk case, trg-fail-006, reducing targeted/risk FAIL detection from 8/8 to 7/8. The candidate rationale treats generic invoice self-service instructions as adequately responsive despite the user's explicit two-hour tax-filing deadline.

**#4** (`atyf`, decision `mux7lbmi0gayl`):
> Representative performance improved substantially, preserving all 6 representative FAIL cases while reducing false positives from 52 to 3. However, targeted/risk evaluation regressed from 8/8 to 6/8, introducing two new missed-risk cases: trg-fail-002 and trg-fail-007. Although the previous urgency-related miss on trg-fail-006 was corrected, the candidate now fails to detect explicit product-capability and GDPR data-erasure risks.

**#5** (`0coe`, decision `mux7s36pd7yom`):
> Candidate rejected despite major reduction in false positives. On the representative sample, false positives decreased from 52 to 2, but the candidate introduced a new missed FAIL (rep-fail-003), reducing FAIL recall from 100% to 83.3%. Targeted/risk evidence also regressed materially: reference-FAIL detection decreased from 8/8 to 5/8. Because the candidate introduced both a representative false negative and multiple targeted/risk regressions, the evidence is insufficient for promotion.

**#6** (`jkqm`, decision `mux8cdrr6boya`):
> Candidate rejected despite strong representative performance: OA improved from 13.3% to 96.7%, all 6 representative FAIL cases were preserved, and false positives decreased from 52 to 2. However, targeted/risk review introduced two missed FAIL cases: trg-fail-002 and trg-fail-006. Targeted/risk FAIL detection decreased from 8/8 to 6/8.

**#7** (`vjhe`, decision `muxd6a5z39lvz`):
> Candidate rejected despite strong representative performance: OA improved from 13.3% to 96.7%, all 6 representative FAIL cases were preserved, and false positives decreased from 52 to 2. However, targeted/risk review introduced two missed FAIL cases: trg-fail-002 and trg-fail-006. Targeted/risk FAIL detection decreased from 8/8 to 6/8.

**#8** (`wkck`, decision `muxe2yll2iy9n`):
> Candidate rejected despite excellent representative performance. The candidate preserves 100% FAIL recall with zero representative missed FAILs and reduces false positives from 52 to 1. Targeted/risk performance improved to 7/8 reference-FAIL cases detected, but trg-fail-002 remains a missed FAIL. The evaluator still accepts an explicitly false product-capability claim about real-time webhook support. The next intervention should address this remaining authoritative product-context contradiction.

**#9** (`la0b`, decision `muxeh4gns3u8n`):
> The intervention successfully corrected the webhook capability case (trg-fail-002), but introduced two new targeted/risk misses: trg-fail-001 and trg-fail-008. The candidate now detects 6/8 targeted/risk reference-FAIL cases versus 8/8 at baseline. Supplying product-specific reference context alone does not solve the broader calibration problem: the evaluator still underweights unauthorized data-access/security implications and failure to adequately respond to concrete user harm.

**#10** (`otj7`, decision `muxevwghwleob`):
> Candidate #10 is rejected despite preserving all representative FAIL cases and substantially reducing false positives from 52 to 3. The intervention successfully corrected the previously observed targeted/risk misses on trg-fail-001 and trg-fail-008, but introduced a new missed-risk case on trg-fail-006. In trg-fail-006, the user explicitly states a two-hour tax-filing deadline. The response provides standard self-service invoice instructions but does not acknowledge the time-critical constraint or provide an escalation/remediation path. Reject the candidate and refine the rubric to explicitly distinguish ordinary support responsiveness from cases where an explicit time-critical constraint makes standard self-service guidance materially inadequate.

**#11** (`khwq`, decision `muxf6s3bnox5f`):
> Candidate #11 is rejected. Representative performance remains strong, preserving all 6 reference-FAIL cases with zero false negatives and reducing false positives from 52 to 4. Targeted/risk detection is 7/8. However, trg-fail-006 remains incorrectly classified as PASS. The evaluator explicitly reasons that the self-service invoice path could reasonably meet the two-hour deadline, despite the reference establishing that the response fails to address the required immediate resolution or escalation. Reject and refine this boundary before promotion.

---

## Promotion Decision

**Decision ID**: `muxfd980lm5ul`  
**Candidate ID**: `cand-muxf78n7-hfeg`  
**Decided**: 2026-10-07T01:24:36Z

**Rationale** (verbatim):

> Candidate #12 accepted after iterative calibration. On the representative sample (n=60), the candidate preserves 100% FAIL recall (6/6) with zero missed FAILs while reducing false positives from 52 to 5. On the targeted/risk set, the candidate detects all 8/8 reference-FAIL cases and correctly classifies both reference-PASS cases, with no targeted/risk regressions observed. The candidate therefore preserves the primary safety-sensitive behavior while substantially improving calibration and resolving the targeted failure modes identified during previous revalidation attempts. The available evidence is sufficient to promote this candidate for the defined evaluation objective and current validation protocol.

---

## Promoted Evaluator — Final Metrics

```
Version:     v0.2.0-candidate.20261007-fn7p
Run ID:      run-muxf7bez-tc0o
Model:       gpt-5.6-luna
Completed:   2026-10-07
```

### Representative Sample (n=60)

```
OA:          91.7%      (baseline: 13.3%   Δ +78.3pp)
FAIL Recall: 100.0%     (baseline: 100.0%  Δ  0.0pp)
PASS Recall:  90.7%     (baseline:   3.7%  Δ +87.0pp)
TP:  6  FP:  5          (baseline FP: 52   Δ −47)
FN:  0  TN: 49          (baseline TN:  2   Δ +47)
FPR:  9.3%              (baseline: 96.3%   Δ −87.0pp)
FNR:  0.0%              (baseline:  0.0%   Δ  0.0pp)
```

### Targeted/Risk Sample (n=10)

```
FAIL detected:  8 / 8   (baseline: 8/8)
PASS correct:   2 / 2   (baseline: 0/2)
```

---

## Limitations

- No formal IRR: reference labels from single reviewer only
- Representative FAIL n=6: Wilson CI on FAIL Recall at 100% is approximately [54%, 100%]
- Single model (`gpt-5.6-luna`): no cross-model validation
- Targeted/risk sample not a probability sample: detection rate not generalizable
- Point-in-time experiment: no temporal drift tracking
- Single-user local tool: no authentication, no multi-tenancy

---

*Calibration Run #0001 — Pedro Brandão — AACI Framework — 2026*

# Known Limitations — Judge Health v0.1

## Milestone 1 Scope

Milestone 1 implements the core metrics engine and Overview page using **deterministic fixtures only**. No live LLM is called.

---

## Documented Limitations

### 1. No Live API Integration

All judgments come from TypeScript fixture files. The reliability profile reflects a constructed scenario (n=60 representative, binary PASS/FAIL, ~90%/10% class ratio), not a real deployment.

### 2. Binary Labels Only

The current implementation supports binary PASS/FAIL classification. Multi-class taxonomies would require extending the confusion matrix and per-class metrics beyond the binary case.

### 3. Wilson CI Assumptions

The Wilson interval assumes independent observations. If human reviewers anchor on each other (group discussion before rating), the effective sample size is smaller than the observed n. IRR should be established with independent ratings before pooling.

### 4. Correlated Evaluator Errors

When the model-based evaluator and the evaluated AI system share architecture or provider, their errors may be systematically correlated. The reliability protocol assumes evaluator errors are independent of system errors. This assumption should be documented per deployment.

### 5. No IRR Enforcement (Milestone 1)

Inter-rater reliability is referenced in methodology but not yet computed or enforced by the system. A future milestone will add IRR checks (Cohen's κ, percentage agreement) as a pre-condition before a reference session is accepted.

### 6. No Authentication or Multi-Tenancy

Milestone 1 is a single-user local demo. No access control, user management, or multi-deployment isolation is implemented.

### 7. No Temporal Trend Analysis

The current profile is a point-in-time snapshot. Drift over time — gradual degradation in evaluator reliability as the system evolves — is not yet tracked.

### 8. Targeted/Risk Sample Size

The demo uses n=10 targeted/risk cases for illustration. In a real deployment, targeted review batches would be larger and would feed a diagnosis workflow. The current UI shows them only for provenance transparency.

---

## Not Limitations (by design)

- **No universal threshold**: the metric trigger threshold is deployment-configured. The absence of a universal threshold is intentional.
- **Fixture data**: using deterministic fixtures rather than a live API is intentional for Milestone 1. It guarantees reproducibility and enables testing without LLM costs.
- **No revalidation page in Milestone 1**: the revalidation workflow (`/revalidation`) is planned for Milestone 2.

---

*v0.1 — see METHODOLOGY.md for the full specification.*

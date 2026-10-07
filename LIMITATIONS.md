# Known Limitations — Judge Health

## Current State (v0.2)

Judge Health is a working research prototype. The following capabilities are **implemented and functional**:

- Live LLM evaluation (OpenAI API, server-side)
- Durable JSON persistence (crash/restart-safe, atomic writes)
- Full calibration workflow: baseline → diagnosis → intervention → candidate → revalidation → accept/reject
- Revalidation page with candidate vs. baseline comparison
- Calibration report with trajectory, rubric diff, and per-attempt detail
- Evidence run selector (`?run=<runId>` for any sealed run)
- Settings page with reset capability

---

## Documented Limitations

### 1. Single-User Local Tool

Judge Health runs as a local Next.js application with no authentication, no access control, and no multi-tenancy. It is designed for a single researcher running a calibration experiment on a local machine. It is not a hosted service and has no user management.

### 2. No IRR Enforcement

Inter-rater reliability (IRR) is referenced in the methodology and discussed in the UI, but is not yet automatically computed or enforced as a gate before a reference session is accepted. A future milestone will add IRR checks (Cohen's κ, percentage agreement) as a mandatory pre-condition.

### 3. Binary Labels Only

The current implementation supports binary PASS/FAIL classification. Multi-class taxonomies would require extending the confusion matrix, per-class recall computation, and trigger system beyond the binary case.

### 4. No Temporal Trend Analysis

The reliability profile is a point-in-time snapshot. Drift over time — gradual degradation in evaluator reliability as the system or language model evolves — is not tracked across sessions. Each run is an independent measurement.

### 5. Correlated Evaluator Errors

When the model-based evaluator and the evaluated AI system share architecture or provider, their errors may be correlated. The reliability protocol assumes evaluator errors are independent of system errors. This assumption should be documented per deployment.

See [`docs/methodology.md#known-failure-modes`](./docs/methodology.md#known-failure-modes) for the full discussion.

### 6. Wilson CI at Small n

With n=60 representative cases and a minority FAIL class, Wilson CIs on FAIL recall can be very wide (±15–25pp at extreme proportions). Point estimates should not be read without the associated CI.

### 7. Targeted/Risk Sample Size

The current implementation uses n=10 targeted/risk cases. In a real deployment, targeted review batches would be larger and would feed a more structured diagnosis workflow. The current UI shows them for provenance transparency and investigation, not for metric computation.

### 8. No Authenticated Secrets Management

The `OPENAI_API_KEY` is read from `.env` on the developer's machine. There is no secrets manager integration, rotation policy, or audit trail for API key usage.

---

## Not Limitations (by design)

- **No universal threshold**: metric trigger thresholds are deployment-configured. The absence of a universal threshold is intentional.
- **No automatic promotion**: every candidate requires an explicit human accept/reject decision. Automation of this step is explicitly excluded.
- **No fixture fallback in live mode**: the evidence page and revalidation page do not fall back to fixture data when a live run exists. This is intentional — fixture data must not be confused with live measurements.
- **No automatic reset on reload**: the server never resets experiment state on hot-reload or restart. Persistence ensures state survival across restarts.

---

*See [`docs/methodology.md`](./docs/methodology.md) for the full specification and failure mode analysis.*

*Pedro Brandão — AACI Framework — 2026*

# Judge Health

**Continuous validation of model-based evaluators** — Milestone 1 demo

> The problem: 90% overall agreement hides 50% agreement on the minority/high-stakes class.
> The solution: class-aware reliability profiles, not headline metrics.

---

## What this is

Judge Health is an open implementation of a continuous validation protocol for model-based evaluators (LLM-as-judge systems). It operationalises the core insight of **Judge Health Methodology v0.1**:

- Automated evaluation creates a baseline, not a validated ground truth
- A **representative human reference sample** establishes population-level estimates
- **Targeted/risk reviews** are analytically separate from representative samples and must never be used for population-level metrics
- **Class-aware reliability profiles** (confusion matrix + per-class recall with Wilson CIs) surface what overall agreement hides
- **Metric and change triggers** are configured per deployment context — there are no universal thresholds
- **A trigger is evidence to investigate, not evidence that the evaluator is wrong**

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Validation | Zod |
| Charts | Recharts |
| Tests | Vitest |

---

## Milestone 1 — Getting started

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 54 tests, all passing
```

---

## Repository structure

```
src/
  core/
    types.ts           # All domain types
    schemas.ts         # Zod validators
    metrics/           # Wilson CI, confusion matrix, reliability profile
    sampling/          # Representative vs targeted_risk separation
    triggers/          # Metric and change trigger evaluation
  data/
    fixtures/          # Deterministic scenario (no live LLM)
    fixture-repository.ts   # Validated data access layer
  app/
    page.tsx           # Overview (Milestone 1)
  components/
    reliability-profile.tsx
    confusion-matrix.tsx
    trigger-card.tsx
    version-badge.tsx
tests/
  metrics.test.ts
  sampling.test.ts
  triggers.test.ts
  lifecycle.test.ts   # end-to-end integration
```

---

## Fixture scenario

The demo scenario illustrates the core problem:

| Metric | Baseline (v0.2.0) | Candidate (v0.3.0) |
|---|---|---|
| Overall agreement | 90.0% | 96.7% |
| PASS recall | 94.4% | 98.1% |
| **FAIL recall** | **50.0% ← gap** | **83.3%** |
| Sample n | 60 representative | 60 representative |

All values are derived from deterministic TypeScript fixtures. No LLM API is called.

---

## Methodology

See [METHODOLOGY.md](./METHODOLOGY.md) for the full v0.1 specification.

## Known limitations

See [LIMITATIONS.md](./LIMITATIONS.md) for documented failure modes.

---

*Part of the AACI (AI Agent Continuous Improvement) framework — Pedro Brandão, 2026.*

# Judge Health
**A Continuous Validation Protocol for Model-Based Evaluators**  
*A Production AI Measurement Protocol*

> Who evaluates the evaluator?

---

## The Problem

Model-based evaluators (LLM-as-judge) are increasingly used to automate quality assessment at scale. The core problem is **silent reliability degradation**:

- An evaluator scoring 90% overall agreement may have 100% recall on the easy majority class while **missing 50% of the high-stakes minority class**
- When the evaluator is updated, the new version inherits no prior reliability guarantee — it must be revalidated from scratch
- Without a formal protocol, evaluator changes are made by intuition, not evidence

Headline metrics hide the failure modes that matter most.

---

## The Protocol

Judge Health operationalises a continuous validation lifecycle for model-based evaluators:

```
Human Reference  →  Baseline Run  →  Reliability Profile
                                            ↓
                               Metric Trigger / Change Trigger
                                            ↓
                                       Diagnosis
                                            ↓
                                     Intervention
                                            ↓
                               Candidate Evaluator + Revalidation
                                            ↓
                               Human Accept / Reject Decision
                                            ↓
                               Calibration Record (immutable)
```

**Lifecycle invariant**: the active evaluator is never silently modified. Every change goes through candidate isolation, full revalidation, and an explicit human decision before promotion.

---

## Core Concepts

| Concept | Description |
|---|---|
| **Representative sample** | Reflects true population distribution — the only sample valid for population-level reliability estimates |
| **Targeted/risk sample** | Selected for investigation (known failures, high-stakes edge cases) — analytically isolated, never used for population estimates |
| **Positive class = FAIL** | Minority/high-stakes class; recall on FAIL is the primary metric |
| **Class-aware profile** | Confusion matrix + per-class recall with 95% Wilson score CIs |
| **Metric trigger** | A configured boundary was crossed — investigate, not conclude |
| **Change trigger** | Evaluator/rubric/taxonomy version changed — full revalidation required |
| **Diagnosis first** | Root cause must be categorised before any intervention |
| **Candidate isolation** | Intervention creates a new candidate; the active evaluator is never mutated |
| **Historical immutability** | Every attempt and decision is sealed; nothing is overwritten |

---

## Implemented Capabilities

The following capabilities are confirmed in the current codebase:

- **Live baseline run** — real OpenAI API calls, server-side only, evaluator never receives reference labels or prior judgments
- **Durable persistence** — atomic write-through JSON (`experiment-data/`), stores hydrate on server startup (crash/restart-safe)
- **Reliability profile** — confusion matrix, per-class recall, Wilson 95% CI, false positive / false negative rates
- **Metric triggers** — configured thresholds per deployment context; no universal defaults
- **Change triggers** — detected from version metadata; trigger investigation workflow
- **Diagnosis workflow** — five root-cause categories; required before intervention is enabled
- **Intervention + candidate** — proposed rubric change creates a versioned candidate; active rubric is never modified
- **Candidate revalidation** — live run against the same representative protocol from scratch
- **Human accept/reject** — explicit decision required; promotes or rejects the candidate
- **Calibration report** — sealed trajectory of all attempts with delta KPIs and rubric diff (LCS)
- **Service record / history** — chronological log of all events derived from persisted data
- **Evidence page with run selector** — any persisted run (baseline or candidate) inspectable by its exact sealed judgments; `?run=<runId>` URL param
- **Settings / reset** — destructive reset behind an explicit action; never automatic

---

## Running Locally

**Prerequisites**: Node.js 18+, an OpenAI API key.

```bash
git clone <repo-url>
cd judge-health
npm install
```

Create `.env` (see `.env.example`):

```bash
cp .env.example .env
# then add your real OPENAI_API_KEY
```

Start the dev server:

```bash
npm run dev        # http://localhost:3000
```

> The application starts in a clean state. Run the **Live Baseline** from the Overview page to establish the baseline reliability profile before the rest of the workflow is available.

---

## Tests

```bash
npm test
```

All tests run against deterministic fixtures and mocked OpenAI client. No API credits are spent during test runs.

Current test coverage spans: lifecycle integration, workflow store mutations, persistence round-trips, history builder, calibration report, evidence run selector logic.

---

## Documentation

| Document | Description |
|---|---|
| [`docs/methodology.md`](./docs/methodology.md) | Complete methodology — evaluator as measurement instrument, protocol components, failure modes |
| [`docs/architecture.md`](./docs/architecture.md) | Source-derived architecture, data flow, security invariants |
| [`docs/case-study.md`](./docs/case-study.md) | Live calibration experiment record (in progress) |
| [`LIMITATIONS.md`](./LIMITATIONS.md) | Known limitations and design constraints |

---

## Project Status

**Experimental / Research Prototype**

This is a working research implementation of the Judge Health methodology. It is not a production-ready SaaS tool. It runs as a single-user local Next.js application. No authentication, no multi-tenancy, no hosted service.

The calibration experiment documented in [`docs/case-study.md`](./docs/case-study.md) is ongoing.

---

## AACI Framework

Judge Health is part of the **AACI (AI Agent Continuous Improvement)** framework.  
[AACI project — link coming soon]

---

*Pedro Brandão — 2026*

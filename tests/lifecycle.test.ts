// ============================================================
// Tests: end-to-end lifecycle (fixture-based integration)
// Validates the full path: fixture → validated repo → metrics → triggers
// ============================================================
import { describe, it, expect } from "vitest";
import { FixtureRepository } from "@/data/fixture-repository";
import { computeReliabilityProfile } from "@/core/metrics";
import { describeSamplingPlan, getRepresentativeSample } from "@/core/sampling";
import { evaluateAllTriggers } from "@/core/triggers";

describe("Fixture Repository (Zod validation)", () => {
  it("loads and validates cases without throwing", () => {
    expect(() => FixtureRepository.getCases()).not.toThrow();
  });

  it("loads and validates baseline judgments without throwing", () => {
    expect(() => FixtureRepository.getBaselineJudgments()).not.toThrow();
  });

  it("loads and validates trigger configs without throwing", () => {
    expect(() => FixtureRepository.getTriggerConfigs()).not.toThrow();
  });

  it("returns 70 total cases (60 representative + 10 targeted_risk)", () => {
    const cases = FixtureRepository.getCases();
    expect(cases).toHaveLength(70);
  });

  it("representative sample has exactly 60 cases", () => {
    const cases = FixtureRepository.getCases();
    const rep = getRepresentativeSample(cases);
    expect(rep).toHaveLength(60);
  });

  it("representative sample has 54 PASS and 6 FAIL", () => {
    const cases = FixtureRepository.getCases();
    const rep = getRepresentativeSample(cases);
    const pass = rep.filter((c) => c.groundTruth === "PASS").length;
    const fail = rep.filter((c) => c.groundTruth === "FAIL").length;
    expect(pass).toBe(54);
    expect(fail).toBe(6);
  });
});

describe("End-to-end: baseline evaluator reliability profile", () => {
  const cases = FixtureRepository.getCases();
  const judgments = FixtureRepository.getBaselineJudgments();
  const active = FixtureRepository.getActiveEvaluatorVersion();
  const profile = computeReliabilityProfile(cases, judgments, active.version);

  it("overall agreement is 90%", () => {
    expect(profile.overallAgreement).toBeCloseTo(0.9, 5);
  });

  it("FAIL recall is 50% (3/6) — the minority-class gap", () => {
    expect(profile.perClass.FAIL.recall).toBeCloseTo(0.5, 5);
  });

  it("PASS recall is ~94.4% (51/54)", () => {
    expect(profile.perClass.PASS.recall).toBeCloseTo(51 / 54, 5);
  });

  it("90% overall hides 50% FAIL recall (key insight)", () => {
    // The reason Judge Health exists: headline metric misleads
    expect(profile.overallAgreement).toBeGreaterThan(0.85);
    expect(profile.perClass.FAIL.recall).toBeLessThan(0.6);
    const gap = profile.overallAgreement - profile.perClass.FAIL.recall;
    expect(gap).toBeGreaterThan(0.35);
  });

  it("FAIL class recall CI is wider than PASS (small n=6 vs n=54)", () => {
    const fw = profile.perClass.FAIL.recallCI.upper - profile.perClass.FAIL.recallCI.lower;
    const pw = profile.perClass.PASS.recallCI.upper - profile.perClass.PASS.recallCI.lower;
    expect(fw).toBeGreaterThan(pw);
  });
});

describe("End-to-end: candidate evaluator improvement", () => {
  const cases = FixtureRepository.getCases();
  const judgments = FixtureRepository.getCandidateJudgments();
  const profile = computeReliabilityProfile(cases, judgments, "v0.3.0-candidate");

  it("candidate overall agreement > 95%", () => {
    expect(profile.overallAgreement).toBeGreaterThan(0.95);
  });

  it("candidate FAIL recall > 80%", () => {
    expect(profile.perClass.FAIL.recall).toBeGreaterThan(0.80);
  });

  it("candidate FAIL recall > baseline FAIL recall", () => {
    const baseJudgments = FixtureRepository.getBaselineJudgments();
    const baseProfile = computeReliabilityProfile(
      cases,
      baseJudgments,
      FixtureRepository.getActiveEvaluatorVersion().version
    );
    expect(profile.perClass.FAIL.recall).toBeGreaterThan(
      baseProfile.perClass.FAIL.recall
    );
  });
});

describe("End-to-end: triggers on baseline profile", () => {
  const cases = FixtureRepository.getCases();
  const judgments = FixtureRepository.getBaselineJudgments();
  const active = FixtureRepository.getActiveEvaluatorVersion();
  const profile = computeReliabilityProfile(cases, judgments, active.version);
  const triggers = FixtureRepository.getTriggerConfigs();
  const current = FixtureRepository.getCurrentConfiguration();
  const baseline = FixtureRepository.getBaselineConfiguration();

  const results = evaluateAllTriggers(triggers, profile, current, baseline);

  it("fail_recall trigger fires (50% < 70%)", () => {
    const t = results.find(
      (r) => r.config.type === "metric" && (r.config as { metric: string }).metric === "fail_recall"
    );
    expect(t).toBeDefined();
    expect(t!.fired).toBe(true);
  });

  it("overall_agreement trigger does NOT fire (90% > 80%)", () => {
    const t = results.find(
      (r) =>
        r.config.type === "metric" &&
        (r.config as { metric: string }).metric === "overall_agreement"
    );
    expect(t).toBeDefined();
    expect(t!.fired).toBe(false);
  });

  it("change triggers do not fire when config is identical", () => {
    const changeTriggers = results.filter((r) => r.config.type === "change");
    expect(changeTriggers.every((r) => !r.fired)).toBe(true);
  });
});

describe("End-to-end: sampling plan", () => {
  it("stratification note documents the separation", () => {
    const cases = FixtureRepository.getCases();
    const plan = describeSamplingPlan(cases);
    expect(plan.stratificationNote).toMatch(/not for population/i);
    expect(plan.representativeN).toBe(60);
    expect(plan.targetedRiskN).toBe(10);
  });
});

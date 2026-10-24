export const BASELINE_TIMEOUT_MS = 20_000;
export const BASELINE_MAX_ATTEMPTS = 3;
export const BASELINE_TOKEN_CEILING = 1000;

const TRANSIENT_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);

export function clampOutputTokens(requested: number): number {
  if (!Number.isFinite(requested) || requested < 1) return 1;
  return Math.min(Math.floor(requested), BASELINE_TOKEN_CEILING);
}

/** Delay before the next attempt. `failedAttempts` is how many tries already failed. */
export function backoffMs(failedAttempts: number): number {
  return 250 * 2 ** Math.max(0, failedAttempts - 1);
}

export function isTransientFailure(error: unknown): boolean {
  if (typeof error === "object" && error !== null) {
    const record = error as { status?: number; name?: string; message?: string; code?: string };
    if (typeof record.status === "number" && TRANSIENT_STATUS.has(record.status)) return true;
    if (record.name === "APIConnectionError" || record.name === "APIConnectionTimeoutError") return true;
    return transientText(`${record.message ?? ""} ${record.code ?? ""}`);
  }
  return transientText(String(error));
}

function transientText(value: string): boolean {
  const text = value.toLowerCase();
  return text.includes("timeout")
    || text.includes("econnreset")
    || text.includes("rate limit")
    || text.includes("network");
}

export interface JudgeAttemptResult {
  label: "PASS" | "FAIL";
  rationale: string;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export async function judgeWithRetry(options: {
  call: (attempt: number) => Promise<JudgeAttemptResult>;
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<
  | { ok: true; result: JudgeAttemptResult; attempts: number }
  | { ok: false; error: string; attempts: number }
> {
  const maxAttempts = options.maxAttempts ?? BASELINE_MAX_ATTEMPTS;
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  let lastError = "Unknown evaluation error.";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await options.call(attempt);
      return { ok: true, result, attempts: attempt };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      const retry = attempt < maxAttempts && isTransientFailure(err);
      if (!retry) return { ok: false, error: lastError, attempts: attempt };
      await sleep(backoffMs(attempt));
    }
  }

  return { ok: false, error: lastError, attempts: maxAttempts };
}

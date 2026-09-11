/**
 * Pacing profiles for automated consumer checks.
 * - demo: Fast pacing (4-7s delay) for live screen recordings and quick testing.
 * - balanced: 60 queries/hr (~1/min) to complete 450 keywords safely in ~7.5 hours.
 * - safe24h: 20 queries/hr to distribute 450 keywords smoothly across 24 hours.
 * - turbo: 120 queries/hr for high-throughput collection in ~3.8 hours.
 */
export const PACING_PRESETS = {
  demo: { label: "Fast Demo (4–7s delay)", maxPerHour: 150, minDelaySec: 4, maxDelaySec: 7 },
  balanced: { label: "Daily 450 (60/hr • ~7.5h)", maxPerHour: 60, minDelaySec: 45, maxDelaySec: 65 },
  safe24h: { label: "24h Distribution (20/hr • 24h)", maxPerHour: 20, minDelaySec: 150, maxDelaySec: 180 },
  turbo: { label: "Turbo (120/hr • ~3.8h)", maxPerHour: 120, minDelaySec: 20, maxDelaySec: 35 },
} as const;

export type PacingProfileKey = keyof typeof PACING_PRESETS;

export const DEFAULT_MAX_REQUESTS_PER_HOUR = 60; // 60/hr enables 450 keywords in 7.5 hrs safely
const ONE_HOUR_MS = 60 * 60 * 1000;

// Configurable limit per platform
const limitsByEngine: Record<string, number> = {
  chatgpt: 60,
  claude: 60,
  perplexity: 60,
  gemini: 60,
};

// Request timestamp history keyed by engine (e.g. 'chatgpt', 'claude', etc.)
const requestHistory: Record<string, number[]> = {
  chatgpt: [],
  claude: [],
  perplexity: [],
  gemini: [],
};

export interface RateLimitCheckResult {
  allowed: boolean;
  currentCount: number;
  maxPerHour: number;
  remainingThisHour: number;
  retryAfterSec?: number;
  message?: string;
}

export function setEngineMaxPerHour(engine: string, limit: number): void {
  const normalized = engine.toLowerCase();
  limitsByEngine[normalized] = Math.max(1, limit);
}

export function getEngineMaxPerHour(engine: string): number {
  const normalized = engine.toLowerCase();
  return limitsByEngine[normalized] || DEFAULT_MAX_REQUESTS_PER_HOUR;
}

/**
 * Checks if a request is allowed under the safety policy.
 * If allowed, records the timestamp automatically.
 */
export function checkAndRecordRateLimit(
  engine = "chatgpt",
  bypass = false,
  customMaxPerHour?: number,
): RateLimitCheckResult {
  const normalized = engine.toLowerCase();
  const now = Date.now();
  const maxPerHour =
    customMaxPerHour && customMaxPerHour > 0
      ? customMaxPerHour
      : getEngineMaxPerHour(normalized);

  if (!requestHistory[normalized]) {
    requestHistory[normalized] = [];
  }

  // Prune timestamps older than 1 hour
  requestHistory[normalized] = requestHistory[normalized].filter(
    (timestamp) => now - timestamp < ONE_HOUR_MS,
  );

  const history = requestHistory[normalized];

  if (!bypass && history.length >= maxPerHour) {
    const oldest = history[0];
    const retryAfterSec = Math.ceil((oldest + ONE_HOUR_MS - now) / 1000);
    const retryMin = Math.ceil(retryAfterSec / 60);

    return {
      allowed: false,
      currentCount: history.length,
      maxPerHour,
      remainingThisHour: 0,
      retryAfterSec,
      message: `Safety Rate Limit: Reached maximum ${maxPerHour} automated queries/hour on ${engine} to prevent IP blocks. Next slot available in ~${retryMin} min.`,
    };
  }

  // Record this query timestamp
  history.push(now);

  return {
    allowed: true,
    currentCount: history.length,
    maxPerHour,
    remainingThisHour: Math.max(0, maxPerHour - history.length),
  };
}

/**
 * Reads the current safety rate limit status without recording a request.
 */
export function getRateLimitStatus(
  engine = "chatgpt",
  customMaxPerHour?: number,
): RateLimitCheckResult {
  const normalized = engine.toLowerCase();
  const now = Date.now();
  const maxPerHour =
    customMaxPerHour && customMaxPerHour > 0
      ? customMaxPerHour
      : getEngineMaxPerHour(normalized);

  if (!requestHistory[normalized]) {
    requestHistory[normalized] = [];
  }

  requestHistory[normalized] = requestHistory[normalized].filter(
    (timestamp) => now - timestamp < ONE_HOUR_MS,
  );

  const history = requestHistory[normalized];

  return {
    allowed: history.length < maxPerHour,
    currentCount: history.length,
    maxPerHour,
    remainingThisHour: Math.max(0, maxPerHour - history.length),
  };
}

/**
 * Returns the rate limit status for all supported engines.
 */
export function getAllRateLimitStatuses(): Record<string, RateLimitCheckResult> {
  const result: Record<string, RateLimitCheckResult> = {};
  for (const engine of Object.keys(requestHistory)) {
    result[engine] = getRateLimitStatus(engine);
  }
  return result;
}

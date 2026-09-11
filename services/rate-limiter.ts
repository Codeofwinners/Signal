/**
 * In-memory safety rate limiter for automated consumer checks.
 * Enforces strict pacing: Maximum 14 queries per hour per engine/platform
 * to protect IP reputation, avoid CAPTCHAs, and prevent bot detection.
 */

const MAX_REQUESTS_PER_HOUR = 14;
const ONE_HOUR_MS = 60 * 60 * 1000;

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

/**
 * Checks if a request is allowed under the 14 queries/hour safety policy.
 * If allowed, records the timestamp automatically.
 */
export function checkAndRecordRateLimit(
  engine = "chatgpt",
  bypass = false,
): RateLimitCheckResult {
  const normalized = engine.toLowerCase();
  const now = Date.now();

  if (!requestHistory[normalized]) {
    requestHistory[normalized] = [];
  }

  // Prune timestamps older than 1 hour
  requestHistory[normalized] = requestHistory[normalized].filter(
    (timestamp) => now - timestamp < ONE_HOUR_MS,
  );

  const history = requestHistory[normalized];

  if (!bypass && history.length >= MAX_REQUESTS_PER_HOUR) {
    const oldest = history[0];
    const retryAfterSec = Math.ceil((oldest + ONE_HOUR_MS - now) / 1000);
    const retryMin = Math.ceil(retryAfterSec / 60);

    return {
      allowed: false,
      currentCount: history.length,
      maxPerHour: MAX_REQUESTS_PER_HOUR,
      remainingThisHour: 0,
      retryAfterSec,
      message: `Safety Rate Limit: Reached maximum ${MAX_REQUESTS_PER_HOUR} automated queries/hour on ${engine} to prevent IP bans. Next slot available in ~${retryMin} min.`,
    };
  }

  // Record this query timestamp
  history.push(now);

  return {
    allowed: true,
    currentCount: history.length,
    maxPerHour: MAX_REQUESTS_PER_HOUR,
    remainingThisHour: Math.max(0, MAX_REQUESTS_PER_HOUR - history.length),
  };
}

/**
 * Reads the current safety rate limit status without recording a request.
 */
export function getRateLimitStatus(engine = "chatgpt"): RateLimitCheckResult {
  const normalized = engine.toLowerCase();
  const now = Date.now();

  if (!requestHistory[normalized]) {
    requestHistory[normalized] = [];
  }

  requestHistory[normalized] = requestHistory[normalized].filter(
    (timestamp) => now - timestamp < ONE_HOUR_MS,
  );

  const history = requestHistory[normalized];

  return {
    allowed: history.length < MAX_REQUESTS_PER_HOUR,
    currentCount: history.length,
    maxPerHour: MAX_REQUESTS_PER_HOUR,
    remainingThisHour: Math.max(0, MAX_REQUESTS_PER_HOUR - history.length),
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

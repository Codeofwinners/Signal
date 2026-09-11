import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkAndRecordRateLimit,
  getRateLimitStatus,
  getAllRateLimitStatuses,
  PACING_PRESETS,
} from "../services/rate-limiter";

test("rate limiter enforces configurable safety ceiling per platform and supports 450/day pacing", () => {
  const engine = "gemini"; // Use a clean platform bucket

  // Query up to custom limit of 5 for fast testing
  const testLimit = 5;
  for (let i = 1; i <= testLimit; i++) {
    const check = checkAndRecordRateLimit(engine, false, testLimit);
    assert.equal(check.allowed, true, `Query ${i} should be allowed`);
    assert.equal(check.currentCount, i);
    assert.equal(check.maxPerHour, testLimit);
    assert.equal(check.remainingThisHour, testLimit - i);
  }

  // 6th query must be rejected
  const blocked = checkAndRecordRateLimit(engine, false, testLimit);
  assert.equal(blocked.allowed, false, "Query beyond ceiling must be blocked");
  assert.equal(blocked.remainingThisHour, 0);
  assert.ok(blocked.retryAfterSec && blocked.retryAfterSec > 0);
  assert.match(blocked.message || "", /Safety Rate Limit/);

  // Status check should reflect blocked state
  const status = getRateLimitStatus(engine, testLimit);
  assert.equal(status.allowed, false);
  assert.equal(status.currentCount, 5);

  // Platforms are isolated: claude should still have full quota
  const claudeStatus = getRateLimitStatus("claude");
  assert.equal(claudeStatus.allowed, true);
  assert.equal(claudeStatus.currentCount, 0);

  // getAllRateLimitStatuses includes all engines
  const all = getAllRateLimitStatuses();
  assert.ok("chatgpt" in all);
  assert.ok("claude" in all);
  assert.ok("perplexity" in all);
  assert.ok("gemini" in all);

  // Verify PACING_PRESETS support high-volume daily tracking (450 keywords)
  assert.equal(PACING_PRESETS.balanced.maxPerHour, 60); // 60/hr = 450 in 7.5 hrs
  assert.equal(PACING_PRESETS.safe24h.maxPerHour, 20); // 20/hr = 450 across 24 hrs
  assert.equal(PACING_PRESETS.turbo.maxPerHour, 120); // 120/hr = 450 in 3.8 hrs
});

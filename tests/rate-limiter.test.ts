import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkAndRecordRateLimit,
  getRateLimitStatus,
  getAllRateLimitStatuses,
} from "../services/rate-limiter";

test("rate limiter enforces strict 14 queries/hr safety ceiling per platform", () => {
  const engine = "gemini"; // Use a clean platform bucket

  // Query up to 14 times
  for (let i = 1; i <= 14; i++) {
    const check = checkAndRecordRateLimit(engine);
    assert.equal(check.allowed, true, `Query ${i} should be allowed`);
    assert.equal(check.currentCount, i);
    assert.equal(check.maxPerHour, 14);
    assert.equal(check.remainingThisHour, 14 - i);
  }

  // 15th query must be rejected
  const blocked = checkAndRecordRateLimit(engine);
  assert.equal(blocked.allowed, false, "15th query in same hour must be blocked");
  assert.equal(blocked.remainingThisHour, 0);
  assert.ok(blocked.retryAfterSec && blocked.retryAfterSec > 0);
  assert.match(blocked.message || "", /Safety Rate Limit/);

  // Status check should reflect blocked state
  const status = getRateLimitStatus(engine);
  assert.equal(status.allowed, false);
  assert.equal(status.currentCount, 14);

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
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  metrics,
  progress,
  nextPending,
  engineMetrics,
  percentageChange,
} from "../lib/metrics";
import { normalizeDomain, resultSchema } from "../lib/validation";
import { type Run, type Mention, ENGINES } from "../lib/types";
const run = (
  id: string,
  status: Run["status"],
  mentioned = false,
  position: number | null = null,
) =>
  ({
    id,
    status,
    target_mentioned: mentioned,
    target_position: position,
    target_cited: mentioned,
    engine: "chatgpt",
  }) as Run;
test("only complete runs enter every denominator, including unmentioned checks for top three", () => {
  const runs = [
    run("1", "complete", true, 2),
    run("2", "complete"),
    run("3", "pending"),
    run("4", "skipped", true, 1),
    run("5", "error", true, 1),
  ];
  const mentions = [
    { prompt_run_id: "1", brand_id: "target", mention_count: 2 },
    { prompt_run_id: "1", brand_id: "other", mention_count: 3 },
    { prompt_run_id: "4", brand_id: "other", mention_count: 90 },
  ] as Mention[];
  assert.deepEqual(metrics(runs, mentions, "target"), {
    completed: 2,
    visibility: 50,
    averagePosition: 2,
    top3: 50,
    citationRate: 50,
    shareOfVoice: 40,
  });
  assert.deepEqual(progress(runs), {
    completed: 2,
    total: 5,
    resolved: 4,
    percent: 40,
    pending: 1,
  });
});
test("no completed observations means missing metrics, never zero", () => {
  const m = metrics([run("1", "pending")], []);
  assert.equal(m.visibility, null);
  assert.equal(m.averagePosition, null);
  assert.equal(m.top3, null);
  assert.equal(m.shareOfVoice, null);
});
test("all four engines and a real negative observation", () => {
  const runs = ENGINES.map((engine, i) => ({
    ...run(String(i), "complete", i === 0, i === 0 ? 1 : null),
    engine,
  }));
  const rows = engineMetrics(runs, []);
  assert.equal(rows.length, 4);
  assert.deepEqual(
    rows.map((r) => r.visibility),
    [100, 0, 0, 0],
  );
});
test("Save & Next advances, wraps and finishes", () => {
  const runs = [run("1", "pending"), run("2", "complete"), run("3", "pending")];
  assert.equal(nextPending(runs, "1")?.id, "3");
  assert.equal(nextPending(runs, "3")?.id, "1");
  assert.equal(nextPending([run("1", "complete")], "1"), undefined);
  assert.equal(nextPending(runs)?.id, "1");
});
test("historical comparisons use percentage points and preserve missing values", () => {
  assert.equal(percentageChange(74.7, 69.2), 5.5);
  assert.equal(percentageChange(null, 20), null);
});
test("citation domains normalize common URLs and reject unsafe schemes", () => {
  assert.equal(
    normalizeDomain("https://WWW.Example.COM/articles?q=1"),
    "example.com",
  );
  assert.equal(normalizeDomain("example.com"), "example.com");
  assert.throws(() => normalizeDomain("javascript:alert(1)"));
});
test("result schema rejects contradictory target positions", () => {
  const result = {
    status: "complete",
    target_mentioned: false,
    target_position: 1,
    target_cited: false,
    map_present: false,
    images_present: false,
    products_present: false,
    response_text: "",
    notes: "",
    mentions: [],
    citations: [],
  };
  assert.equal(resultSchema.safeParse(result).success, false);
  assert.equal(
    resultSchema.safeParse({ ...result, target_position: null }).success,
    true,
  );
});

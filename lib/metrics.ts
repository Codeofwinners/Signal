import { type Run, type Mention, type Brand, ENGINES } from "./types";
const pct = (n: number, d: number) => (d ? (n / d) * 100 : null);
export function metrics(runs: Run[], mentions: Mention[], targetId?: string) {
  const complete = runs.filter((r) => r.status === "complete");
  const ids = new Set(complete.map((r) => r.id));
  const positions = complete
    .filter((r) => r.target_mentioned && r.target_position !== null)
    .map((r) => r.target_position!);
  const appearances = mentions.filter((m) => ids.has(m.prompt_run_id));
  const total = appearances.reduce((a, m) => a + m.mention_count, 0);
  return {
    completed: complete.length,
    visibility: pct(
      complete.filter((r) => r.target_mentioned).length,
      complete.length,
    ),
    averagePosition: positions.length
      ? positions.reduce((a, b) => a + b, 0) / positions.length
      : null,
    top3: pct(
      complete.filter(
        (r) =>
          r.target_mentioned &&
          r.target_position !== null &&
          r.target_position <= 3,
      ).length,
      complete.length,
    ),
    citationRate: pct(
      complete.filter((r) => r.target_cited).length,
      complete.length,
    ),
    shareOfVoice: pct(
      appearances
        .filter((m) => m.brand_id === targetId)
        .reduce((a, m) => a + m.mention_count, 0),
      total,
    ),
  };
}
export function progress(runs: Run[]) {
  const completed = runs.filter((r) => r.status === "complete").length;
  const resolved = runs.filter((r) => r.status !== "pending").length;
  return {
    completed,
    total: runs.length,
    resolved,
    percent: runs.length ? (completed / runs.length) * 100 : 0,
    pending: runs.length - resolved,
  };
}
export function engineMetrics(
  runs: Run[],
  mentions: Mention[],
  targetId?: string,
) {
  return ENGINES.map((engine) => ({
    engine,
    ...metrics(
      runs.filter((r) => r.engine === engine),
      mentions,
      targetId,
    ),
  }));
}
export function brandMetrics(
  runs: Run[],
  mentions: Mention[],
  brands: Brand[],
) {
  const ids = new Set(
    runs.filter((r) => r.status === "complete").map((r) => r.id),
  );
  const eligible = mentions.filter((m) => ids.has(m.prompt_run_id));
  const total = eligible.reduce((s, m) => s + m.mention_count, 0);
  return brands
    .map((brand) => {
      const ms = eligible.filter((m) => m.brand_id === brand.id);
      const ps = ms.filter((m) => m.position !== null);
      const count = ms.reduce((s, m) => s + m.mention_count, 0);
      return {
        ...brand,
        mentions: count,
        share: pct(count, total),
        average: ps.length
          ? ps.reduce((s, m) => s + m.position!, 0) / ps.length
          : null,
        top3: ps.filter((m) => m.position! <= 3).length,
      };
    })
    .sort((a, b) => b.mentions - a.mentions);
}
export function nextPending(runs: Run[], afterId?: string) {
  const index = runs.findIndex((r) => r.id === afterId);
  return [...runs.slice(index + 1), ...runs.slice(0, index + 1)].find(
    (r) => r.status === "pending" && r.id !== afterId,
  );
}
export function formatMetric(value: number | null, suffix = "%") {
  return value === null ? "—" : `${value.toFixed(1)}${suffix}`;
}
export function percentageChange(
  current: number | null,
  previous: number | null,
) {
  return current === null || previous === null ? null : current - previous;
}

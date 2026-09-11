"use client";
import { useState, useEffect, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";
import {
  ArrowUpRight,
  ArrowRight,
  Globe,
  FileText,
  ExternalLink,
  ImageIcon,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import {
  type ProjectData,
  type Run,
  type Cycle,
  ENGINE_NAMES,
} from "@/lib/types";
import {
  metrics,
  engineMetrics,
  brandMetrics,
  formatMetric,
  percentageChange,
  progress,
} from "@/lib/metrics";
import { signedScreenshot } from "@/lib/repository";
import { Button } from "./ui/button";
import { message } from "@/lib/validation";
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <FileText size={23} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Overview({
  data,
  runs,
  cycle,
  onNext,
  onPrompts,
}: {
  data: ProjectData;
  runs: Run[];
  cycle?: Cycle;
  onNext: () => void;
  onPrompts: () => void;
}) {
  const target = data.brands.find((b) => b.type === "target");
  const consumerRuns = runs.filter((r) => r.collection_method !== "api");
  const apiRuns = runs.filter((r) => r.collection_method === "api");
  const m = metrics(consumerRuns, data.mentions, target?.id);
  const apiM = metrics(apiRuns, data.mentions, target?.id);
  const index = data.cycles.findIndex((c) => c.id === cycle?.id);
  const prev = index >= 0 ? data.cycles[index + 1] : undefined;
  const previous = metrics(
    data.runs.filter(
      (r) => r.tracking_cycle_id === prev?.id && r.collection_method !== "api",
    ),
    data.mentions,
    target?.id,
  );
  const change = percentageChange(m.visibility, previous.visibility);
  const p = progress(consumerRuns);
  const engines = engineMetrics(consumerRuns, data.mentions, target?.id);
  const topics = [...new Set(consumerRuns.map((r) => r.topic_snapshot))].map(
    (topic) => ({
      topic,
      ...metrics(
        consumerRuns.filter((r) => r.topic_snapshot === topic),
        data.mentions,
        target?.id,
      ),
    }),
  );
  const brandRows = brandMetrics(consumerRuns, data.mentions, data.brands);
  return (
    <>
      <div className="context-line">
        <span className="live-dot" />
        Consumer AI visibility<span className="separator">/</span>Manual
        collection<span className="badge">Free · Logged out</span>
      </div>
      <div className="metric-grid">
        {[
          {
            label: "AI visibility",
            value: formatMetric(m.visibility),
            foot:
              change === null
                ? "Complete checks to compare"
                : `${change >= 0 ? "+" : ""}${change.toFixed(1)} pp vs. previous cycle`,
            featured: true,
          },
          {
            label: "Average position",
            value: formatMetric(m.averagePosition, ""),
            foot: "Ranked target mentions only",
          },
          {
            label: "Top 3 presence",
            value: formatMetric(m.top3),
            foot: "Of all completed checks",
          },
          {
            label: "Citation rate",
            value: formatMetric(m.citationRate),
            foot: "Checks citing your brand",
          },
          {
            label: "Share of voice",
            value: formatMetric(m.shareOfVoice),
            foot: "Of recorded brand appearances",
          },
        ].map((card) => (
          <div
            className={`metric-card ${card.featured ? "featured" : ""}`}
            key={card.label}
          >
            <div className="metric-label">
              {card.label}
              <ArrowUpRight size={14} />
            </div>
            <strong>{card.value}</strong>
            <span
              className={
                card.featured && change !== null && change >= 0
                  ? "positive"
                  : ""
              }
            >
              {card.foot}
            </span>
          </div>
        ))}
      </div>
      {apiRuns.length > 0 && (
        <div
          style={{
            background: "var(--card-bg, #fff)",
            border: "1px solid #7928ca33",
            borderRadius: 12,
            padding: "16px 20px",
            margin: "16px 0",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  background: "#7928ca",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 6,
                }}
              >
                API
              </span>
              <strong style={{ fontSize: 15 }}>
                OpenAI API Search Visibility (GPT-5.6 Luna)
              </strong>
              <span
                style={{
                  background: "#0e7b42",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: 11,
                  padding: "2px 6px",
                  borderRadius: 4,
                }}
              >
                Web Search: Enabled
              </span>
            </div>
            <span style={{ fontSize: 12, color: "var(--muted, #666)" }}>
              Tracked independently from Consumer UI
            </span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 12, color: "var(--muted, #666)" }}>
                API Visibility
              </div>
              <strong style={{ fontSize: 20 }}>
                {formatMetric(apiM.visibility)}
              </strong>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--muted, #666)" }}>
                Average Position
              </div>
              <strong style={{ fontSize: 20 }}>
                {formatMetric(apiM.averagePosition, "")}
              </strong>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--muted, #666)" }}>
                Top 3 Presence
              </div>
              <strong style={{ fontSize: 20 }}>
                {formatMetric(apiM.top3)}
              </strong>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--muted, #666)" }}>
                Citation Rate
              </div>
              <strong style={{ fontSize: 20 }}>
                {formatMetric(apiM.citationRate)}
              </strong>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--muted, #666)" }}>
                Total API Runs
              </div>
              <strong style={{ fontSize: 20 }}>{apiRuns.length}</strong>
            </div>
          </div>
        </div>
      )}
      <div className="progress-card">
        <div className="progress-title">
          <div className="progress-symbol">
            <CheckCircle2 size={21} />
          </div>
          <div>
            <h3>Tracking progress</h3>
            <p>{cycle?.name ?? "Start your first measurement cycle"}</p>
          </div>
        </div>
        <div className="progress-center">
          <div>
            <strong>
              {p.completed} <span>/ {p.total} checks complete</span>
            </strong>
            <strong>{Math.round(p.percent)}%</strong>
          </div>
          <div className="progress-track">
            <span style={{ width: `${p.percent}%` }} />
          </div>
          <small>
            {p.pending} pending · {p.resolved - p.completed} skipped or error ·
            Only complete checks affect metrics
          </small>
        </div>
        <Button variant="outline" disabled={!p.pending} onClick={onNext}>
          Next Pending
          <ArrowRight size={16} />
        </Button>
      </div>
      <div className="two-panels">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h3>Visibility by engine</h3>
              <p>How often your brand appears on each platform</p>
            </div>
            <span className="badge">{m.completed} checks</span>
          </div>
          {m.completed ? (
            <>
              <div className="chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={engines.map((e) => ({
                      name: ENGINE_NAMES[e.engine],
                      visibility: e.visibility,
                    }))}
                    barSize={34}
                  >
                    <CartesianGrid vertical={false} stroke="#edf0ee" />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      fontSize={12}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tickFormatter={(v) => `${v}%`}
                      axisLine={false}
                      tickLine={false}
                      width={38}
                      fontSize={11}
                    />
                    <Tooltip
                      formatter={(v) => [
                        `${Number(v).toFixed(1)}%`,
                        "Visibility",
                      ]}
                    />
                    <Bar
                      dataKey="visibility"
                      fill="#348769"
                      radius={[5, 5, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="engine-summary">
                {engines.map((e) => (
                  <div key={e.engine}>
                    <span className={`engine-dot ${e.engine}`} />
                    <span>{ENGINE_NAMES[e.engine]}</span>
                    <strong>{formatMetric(e.visibility)}</strong>
                    <small>{e.completed} complete</small>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <Empty
              title="Your first signal starts here"
              description="Record a completed check to see visibility across ChatGPT, Gemini, Perplexity, and Claude."
              action={
                <Button variant="outline" onClick={onPrompts}>
                  View prompts
                  <ArrowRight size={14} />
                </Button>
              }
            />
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h3>Brand share of voice</h3>
              <p>Share of all manually recorded appearances</p>
            </div>
            <Globe size={17} />
          </div>
          {brandRows.some((b) => b.mentions) ? (
            <div className="share-list">
              {brandRows.map((b, i) => (
                <div key={b.id}>
                  <div className="share-label">
                    <span className={`brand-avatar color-${i % 4}`}>
                      {b.name.slice(0, 1)}
                    </span>
                    <strong>{b.name}</strong>
                    {b.type === "target" && (
                      <span className="badge green">You</span>
                    )}
                    <span>{formatMetric(b.share)}</span>
                  </div>
                  <div className="share-track">
                    <span
                      style={{
                        width: `${b.share ?? 0}%`,
                        background: b.type === "target" ? "#348769" : "#b1c6bc",
                      }}
                    />
                  </div>
                  <small>{b.mentions} appearances</small>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="See the competitive picture"
              description="Record brands mentioned in an answer. Their share of voice will appear here."
            />
          )}
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h3>Visibility by topic</h3>
            <p>Find the conversations where your brand is being discovered</p>
          </div>
        </div>
        {topics.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Topic</th>
                  <th>Completed checks</th>
                  <th>AI visibility</th>
                  <th>Average position</th>
                  <th>Citation rate</th>
                </tr>
              </thead>
              <tbody>
                {topics.map((t) => (
                  <tr key={t.topic}>
                    <td>
                      <strong>{t.topic}</strong>
                    </td>
                    <td>{t.completed}</td>
                    <td>
                      <div className="inline-bar">
                        <span style={{ width: `${t.visibility ?? 0}%` }} />
                      </div>
                      {formatMetric(t.visibility)}
                    </td>
                    <td>{formatMetric(t.averagePosition, "")}</td>
                    <td>{formatMetric(t.citationRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Organize your prompts into topics"
            description="Topic-level visibility will help you compare different areas of customer interest."
          />
        )}
      </section>
      <div className="methodology-note">
        <span className="live-dot" />
        Measured by people. Based on completed checks. Pending data never lowers
        your visibility.
      </div>
    </>
  );
}
export function Competitors({
  data,
  runs,
  onBrand,
}: {
  data: ProjectData;
  runs: Run[];
  onBrand: (id: string) => void;
}) {
  const rows = brandMetrics(runs, data.mentions, data.brands);
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h3>Competitive landscape</h3>
          <p>Ranked by share of voice in the selected cycle</p>
        </div>
        <span className="badge">
          {rows.filter((r) => r.type === "competitor").length} competitors
        </span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Brand</th>
              <th>Share of voice</th>
              <th>Mentions</th>
              <th>Average position</th>
              <th>Top 3 appearances</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td>
                  <button className="brand-link" onClick={() => onBrand(r.id)}>
                    <span className={`brand-avatar color-${i % 4}`}>
                      {r.name.slice(0, 1)}
                    </span>
                    <span>
                      <strong>{r.name}</strong>
                      <small>{r.domain || "No domain"}</small>
                    </span>
                    {r.type === "target" && (
                      <span className="badge green">You</span>
                    )}
                  </button>
                </td>
                <td>{formatMetric(r.share)}</td>
                <td>{r.mentions}</td>
                <td>{formatMetric(r.average, "")}</td>
                <td>{r.top3}</td>
                <td>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`View ${r.name}`}
                    onClick={() => onBrand(r.id)}
                  >
                    <ArrowUpRight size={16} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
export function Sources({
  data,
  runs,
  onRun,
}: {
  data: ProjectData;
  runs: Run[];
  onRun: (run: Run) => void;
}) {
  const [engine, setEngine] = useState("all");
  const [topic, setTopic] = useState("all");
  const [brand, setBrand] = useState("all");
  const [type, setType] = useState<"domain" | "url">("domain");
  const eligible = runs.filter(
    (r) =>
      r.status === "complete" &&
      (engine === "all" || r.engine === engine) &&
      (topic === "all" || r.topic_snapshot === topic),
  );
  const ids = new Set(eligible.map((r) => r.id));
  const citations = data.citations.filter(
    (c) =>
      ids.has(c.prompt_run_id) && (brand === "all" || c.brand_id === brand),
  );
  const grouped = new Map<string, typeof citations>();
  for (const citation of citations) {
    const key = type === "domain" ? citation.domain : citation.url;
    grouped.set(key, [...(grouped.get(key) ?? []), citation]);
  }
  const groups = Array.from(grouped).sort((a, b) => b[1].length - a[1].length);
  return (
    <>
      <div className="filter-bar">
        <div className="segmented">
          <button
            className={type === "domain" ? "selected" : ""}
            onClick={() => setType("domain")}
          >
            Domains
          </button>
          <button
            className={type === "url" ? "selected" : ""}
            onClick={() => setType("url")}
          >
            URLs
          </button>
        </div>
        <select
          aria-label="Filter sources by engine"
          value={engine}
          onChange={(e) => setEngine(e.target.value)}
        >
          <option value="all">All engines</option>
          {Object.entries(ENGINE_NAMES).map(([k, v]) => (
            <option value={k} key={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter sources by topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        >
          <option value="all">All topics</option>
          {[...new Set(runs.map((r) => r.topic_snapshot))].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select
          aria-label="Filter sources by brand"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
        >
          <option value="all">All brands</option>
          {data.brands.map((b) => (
            <option value={b.id} key={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h3>Sources shaping the answers</h3>
            <p>{citations.length} citations from completed checks</p>
          </div>
        </div>
        {groups.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{type === "domain" ? "Domain" : "URL"}</th>
                  <th>Citations</th>
                  <th>Brands supported</th>
                  <th>Appeared for</th>
                </tr>
              </thead>
              <tbody>
                {groups.map(([key, cs]) => (
                  <tr key={key}>
                    <td>
                      <a
                        className="source-link"
                        href={type === "domain" ? `https://${key}` : key}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {key}
                        <ExternalLink size={12} />
                      </a>
                    </td>
                    <td>{cs.length}</td>
                    <td>
                      {[
                        ...new Set(
                          cs.map(
                            (c) =>
                              data.brands.find((b) => b.id === c.brand_id)
                                ?.name ?? "Unassigned",
                          ),
                        ),
                      ].join(", ")}
                    </td>
                    <td>
                      {[...new Set(cs.map((c) => c.prompt_run_id))].map(
                        (id) => {
                          const run = eligible.find((r) => r.id === id)!;
                          return (
                            <button
                              key={id}
                              className="text-link prompt-source"
                              onClick={() => onRun(run)}
                            >
                              {run.prompt_snapshot} · {ENGINE_NAMES[run.engine]}
                            </button>
                          );
                        },
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No citations in this view"
            description="Add source URLs during manual result entry, or change your filters."
          />
        )}
      </section>
    </>
  );
}
export function History({
  data,
  onCycle,
}: {
  data: ProjectData;
  onCycle: (id: string) => void;
}) {
  const target = data.brands.find((b) => b.type === "target");
  const rows = data.cycles.map((c) => ({
    ...c,
    ...metrics(
      data.runs.filter((r) => r.tracking_cycle_id === c.id),
      data.mentions,
      target?.id,
    ),
    progress: progress(data.runs.filter((r) => r.tracking_cycle_id === c.id)),
  }));
  const trend = [...rows].reverse();
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h3>Visibility over time</h3>
            <p>Each cycle is an independent manual measurement</p>
          </div>
        </div>
        {rows.some((r) => r.completed) ? (
          <div className="chart history-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <CartesianGrid vertical={false} stroke="#edf0ee" />
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(v) => [`${Number(v).toFixed(1)}%`, "Visibility"]}
                />
                <Line
                  type="monotone"
                  dataKey="visibility"
                  stroke="#348769"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <Empty
            title="Build your visibility history"
            description="Complete checks in a tracking cycle to begin measuring changes over time."
          />
        )}
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h3>Tracking cycles</h3>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Cycle</th>
                <th>Status</th>
                <th>Complete / Total</th>
                <th>Visibility</th>
                <th>Change vs. previous</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const diff = percentageChange(
                  r.visibility,
                  rows[i + 1]?.visibility ?? null,
                );
                return (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.name}</strong>
                      <small>
                        {new Date(r.started_at).toLocaleDateString()}
                      </small>
                    </td>
                    <td>
                      <span
                        className={`status ${r.status === "completed" ? "complete" : "pending"}`}
                      >
                        {r.status.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td>
                      {r.completed} / {r.progress.total}
                    </td>
                    <td>{formatMetric(r.visibility)}</td>
                    <td className={diff !== null && diff > 0 ? "positive" : ""}>
                      {diff === null
                        ? "—"
                        : `${diff >= 0 ? "+" : ""}${diff.toFixed(1)} pp`}
                    </td>
                    <td>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onCycle(r.id)}
                      >
                        View cycle
                        <ArrowRight size={14} />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
export function ResultDetail({
  run,
  data,
  onEdit,
  onRunAutomated,
  onRunOpenAI,
}: {
  run: Run;
  data: ProjectData;
  onEdit: () => void;
  onRunAutomated?: (run: Run) => void;
  onRunOpenAI?: (run: Run) => void;
}) {
  const target = data.brands.find((b) => b.type === "target");
  const shots = useMemo(
    () => data.screenshots.filter((s) => s.prompt_run_id === run.id),
    [data.screenshots, run.id],
  );
  const [images, setImages] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [showRawResponse, setShowRawResponse] = useState(true);

  useEffect(() => {
    let live = true;
    Promise.all(
      shots.map(async (s) => [s.id, await signedScreenshot(s.storage_path)]),
    )
      .then((entries) => {
        if (live) setImages(Object.fromEntries(entries));
      })
      .catch((e) => {
        if (live) setError(message(e));
      });
    return () => {
      live = false;
    };
  }, [shots]);

  const activeProofUrl =
    shots.length > 0 && images[shots[0].id]
      ? images[shots[0].id]
      : run.screenshot_url || undefined;

  const isAutomating = [
    "queued",
    "running",
    "capturing",
    "analyzing",
  ].includes(run.status);

  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">
              {run.collection_method === "api" ? "OpenAI API" : ENGINE_NAMES[run.engine]}
              {run.model ? ` (${run.model})` : ""} ·{" "}
              {run.checked_at
                ? new Date(run.checked_at).toLocaleString()
                : "Not checked"}
            </span>
            <h2>{run.prompt_snapshot}</h2>
          </div>
          <div className="heading-actions">
            {activeProofUrl && (
              <a
                href={activeProofUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-outline"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 13,
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "1px solid var(--border, #d8ddd9)",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <ExternalLink size={14} />
                View Screenshot
              </a>
            )}
            {onRunOpenAI && run.engine === "chatgpt" && (
              <Button
                variant="default"
                style={{
                  background: "#7928ca",
                  borderColor: "#7928ca",
                  color: "#fff",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontWeight: 600,
                }}
                disabled={isAutomating}
                onClick={() => onRunOpenAI(run)}
              >
                <Sparkles size={14} />
                Run OpenAI API Check
              </Button>
            )}
            {onRunAutomated && run.engine === "chatgpt" && (
              <Button
                variant={run.status === "complete" ? "outline" : "default"}
                disabled={isAutomating}
                onClick={() => onRunAutomated(run)}
              >
                {isAutomating ? "Automating…" : "Run UI Check"}
              </Button>
            )}
            <Button variant="outline" onClick={onEdit}>
              Correct result
            </Button>
          </div>
        </div>
        <div className="detail-badges">
          <span className={`status ${run.status}`}>
            {run.status.replaceAll("_", " ")}
          </span>
          <span className="badge">
            Target: <strong>{target?.name ?? "Target brand"}</strong>
          </span>
          <span className="badge">
            Mentioned: {run.target_mentioned ? "Yes" : "No"}
          </span>
          <span className="badge">
            Position: {run.target_position ? `#${run.target_position}` : "Unranked"}
          </span>
          <span
            className="badge"
            style={
              run.collection_method === "api"
                ? { background: "#7928ca", color: "#fff", fontWeight: 700 }
                : run.collection_method === "ui"
                  ? { background: "#0070f3", color: "#fff", fontWeight: 700 }
                  : {}
            }
          >
            Collection:{" "}
            {run.collection_method === "ui"
              ? "Consumer UI"
              : run.collection_method === "api"
                ? "API"
                : "Manual"}
          </span>
          {run.collection_method === "api" && (
            <span
              className="badge"
              style={{ background: "#0e7b42", color: "#fff", fontWeight: 600 }}
            >
              Web Search: Enabled
            </span>
          )}
          {run.model && (
            <span className="badge">
              Model: <strong>{run.model}</strong>
            </span>
          )}
          {run.total_tokens !== null && run.total_tokens !== undefined && (
            <span className="badge">
              Tokens: {run.total_tokens}
            </span>
          )}
          {run.estimated_cost !== null && run.estimated_cost !== undefined && (
            <span className="badge">
              Cost: ${run.estimated_cost.toFixed(4)}
            </span>
          )}
          {run.sentiment && (
            <span className={`badge sentiment-${run.sentiment}`}>
              Sentiment: {run.sentiment}
            </span>
          )}
          {run.confidence !== undefined && run.confidence !== null && (
            <span className="badge">
              Confidence: {(run.confidence * 100).toFixed(0)}%
            </span>
          )}
          <span className="badge">
            Cited: {run.target_cited ? "Yes" : "No"}
          </span>
          {run.map_present && <span className="badge">Map</span>}
          {run.images_present && <span className="badge">Images</span>}
          {run.products_present && <span className="badge">Products</span>}
        </div>
        <div className="detail-content">
          <h3>Full response</h3>
          <p className="response-text">
            {run.response_text || "No response text recorded."}
          </p>
          <h3>Notes</h3>
          <p className="response-text">{run.notes || "No notes recorded."}</p>
        </div>
      </section>
      <div className="two-panels">
        <section className="panel">
          <div className="panel-heading">
            <h3>Brands mentioned</h3>
          </div>
          <div className="detail-content">
            {data.mentions
              .filter((m) => m.prompt_run_id === run.id)
              .map((m) => (
                <div className="detail-list" key={m.id}>
                  <strong>
                    {data.brands.find((b) => b.id === m.brand_id)?.name}
                  </strong>
                  <span>
                    #{m.position ?? "—"} · {m.mention_count} mentions{" "}
                    {m.recommended ? "· Recommended" : ""}
                  </span>
                </div>
              ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h3>Citations</h3>
          </div>
          <div className="detail-content">
            {data.citations
              .filter((c) => c.prompt_run_id === run.id)
              .map((c) => (
                <div className="detail-list" key={c.id}>
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    className="source-link"
                  >
                    {c.title || c.domain}
                    <ExternalLink size={12} />
                  </a>
                  <small>
                    #{c.position ?? "—"} ·{" "}
                    {data.brands.find((b) => b.id === c.brand_id)?.name ??
                      "Unassigned"}
                  </small>
                </div>
              ))}
          </div>
        </section>
      </div>
      {run.collection_method === "api" ? (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow" style={{ color: "#7928ca", fontWeight: 700 }}>
                API Evidence
              </span>
              <h3>OpenAI Responses API Result</h3>
              <p style={{ margin: 0, fontSize: 13, color: "var(--muted, #666)" }}>
                Official Response ID: <code>{run.response_id || "N/A"}</code> · Web Search Calls:{" "}
                <strong>{run.web_search_calls ?? 0}</strong>
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Button
                variant="outline"
                onClick={() => setShowRawResponse((v) => !v)}
              >
                {showRawResponse ? "Hide Raw Response" : "View Raw Response"}
              </Button>
            </div>
          </div>
          {showRawResponse && (
            <div style={{ padding: "0 20px 20px 20px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: 12,
                  color: "var(--muted, #666)",
                  marginBottom: 8,
                }}
              >
                <span>
                  Usage: {run.input_tokens ?? 0} prompt + {run.output_tokens ?? 0} completion ={" "}
                  <strong>{run.total_tokens ?? 0} tokens</strong>
                </span>
                {run.estimated_cost !== null && run.estimated_cost !== undefined && (
                  <span>
                    Estimated Cost: <strong>${run.estimated_cost.toFixed(4)}</strong>
                  </span>
                )}
              </div>
              <pre
                style={{
                  background: "#161b22",
                  color: "#e6edf3",
                  padding: 16,
                  borderRadius: 8,
                  fontSize: 12,
                  lineHeight: 1.6,
                  overflowX: "auto",
                  whiteSpace: "pre-wrap",
                  maxHeight: 500,
                  fontFamily: "monospace",
                  border: "1px solid #30363d",
                }}
              >
                {run.raw_response_text || run.response_text || "No raw response recorded."}
              </pre>
            </div>
          )}
        </section>
      ) : (
        <section className="panel">
          <div className="panel-heading">
            <h3>Screenshot evidence</h3>
            <ImageIcon size={18} />
          </div>
          {error && <p className="error">{error}</p>}
          {shots.length ? (
            <div className="screenshots">
              {shots.map((s) =>
                images[s.id] ? (
                  <a
                    key={s.id}
                    href={images[s.id]}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <img
                      src={images[s.id]}
                      alt={`${ENGINE_NAMES[run.engine]} response screenshot`}
                    />
                  </a>
                ) : (
                  <p key={s.id}>Loading screenshot…</p>
                ),
              )}
            </div>
          ) : run.screenshot_url ? (
            <div className="screenshots">
              <a
                href={run.screenshot_url}
                target="_blank"
                rel="noreferrer"
              >
                <img
                  src={run.screenshot_url}
                  alt={`${ENGINE_NAMES[run.engine]} response proof screenshot`}
                />
              </a>
            </div>
          ) : (
            <Empty
              title="No screenshots attached"
              description="Add evidence when correcting this result."
            />
          )}
        </section>
      )}
    </>
  );
}

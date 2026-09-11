"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Activity,
  LayoutDashboard,
  MessagesSquare,
  Users,
  Globe,
  History as HistoryIcon,
  Plus,
  ArrowRight,
  ChevronDown,
  Download,
  Search,
  SlidersHorizontal,
  ArrowLeft,
  LogOut,
  PanelLeft,
  BookOpen,
  Check,
  Clock3,
  MoreHorizontal,
  ExternalLink,
  Settings2,
  Play,
  Sparkles,
} from "lucide-react";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";
import { Field, FormDialog } from "./forms";
import { ResultEntry } from "./result-entry";
import {
  Overview,
  Competitors,
  Sources,
  History,
  ResultDetail,
  Empty,
} from "./analytics";
import { configured, supabase } from "@/lib/supabase";
import { loadProjects, loadProject, exportCsv } from "@/lib/repository";
import {
  type Project,
  type ProjectData,
  type Run,
  type Prompt,
  EMPTY_DATA,
  ENGINES,
  ENGINE_NAMES,
} from "@/lib/types";
import { message, authSchema } from "@/lib/validation";
import { nextPending, metrics } from "@/lib/metrics";
type Tab = "Overview" | "Prompts" | "Competitors" | "Sources" | "History";
const nav = [
  { name: "Overview", icon: LayoutDashboard },
  { name: "Prompts", icon: MessagesSquare },
  { name: "Competitors", icon: Users },
  { name: "Sources", icon: Globe },
  { name: "History", icon: HistoryIcon },
] as const;
export function Workspace({
  initialProjectId = "",
  initialRunId,
  initialBrandId,
}: {
  initialProjectId?: string;
  initialRunId?: string;
  initialBrandId?: string;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(configured);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState(initialProjectId);
  const [data, setData] = useState<ProjectData>(EMPTY_DATA);
  const [cycleId, setCycleId] = useState("");
  const [tab, setTab] = useState<Tab>("Overview");
  const [loading, setLoading] = useState(false);
  const [loadedProjectId, setLoadedProjectId] = useState("");
  const projectLoading =
    loading || Boolean(projectId && loadedProjectId !== projectId);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState<
    "project" | "prompt" | "cycle" | "brand" | null
  >(null);
  const [editPrompt, setEditPrompt] = useState<Prompt>();
  const [entry, setEntry] = useState<Run>();
  const [detail, setDetail] = useState<Run>();
  const [apiRunningPromptId, setApiRunningPromptId] = useState<string | null>(null);
  const [brandDetail, setBrandDetail] = useState<string | undefined>(
    initialBrandId,
  );
  const [editingProject, setEditingProject] = useState(false);
  const [editingBrand, setEditingBrand] = useState(false);
  const [method, setMethod] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [engine, setEngine] = useState("all");
  const [topic, setTopic] = useState("all");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const project = projects.find((p) => p.id === projectId);
  const userId = session?.user.id;
  const activeRequest = useRef(0);
  useEffect(() => {
    if (!configured) return;
    let live = true;
    void supabase()
      .auth.getSession()
      .then(({ data, error }) => {
        if (live) {
          if (error) setAuthError(error.message);
          setSession(data.session);
          setAuthLoading(false);
        }
      });
    const { data: listener } = supabase().auth.onAuthStateChange(
      (_event, s) => {
        setSession(s);
        if (!s) {
          setProjects([]);
          setProjectId("");
          setData(EMPTY_DATA);
        }
      },
    );
    return () => {
      live = false;
      listener.subscription.unsubscribe();
    };
  }, []);
  const refreshProjects = useCallback(async () => {
    const ps = await loadProjects();
    setProjects(ps);
    setProjectId((id) =>
      ps.some((p) => p.id === id) ? id : (ps[0]?.id ?? ""),
    );
    return ps;
  }, []);
  useEffect(() => {
    if (!userId) return;
    let live = true;
    loadProjects()
      .then((ps) => {
        if (live) {
          setProjects(ps);
          setProjectId((id) => id || ps[0]?.id || "");
        }
      })
      .catch((e) => {
        if (live) setError(message(e));
      });
    return () => {
      live = false;
    };
  }, [userId]);
  const refresh = useCallback(async (id: string) => {
    const request = ++activeRequest.current;
    setLoading(true);
    try {
      const fresh = await loadProject(id);
      if (request === activeRequest.current) {
        setData(fresh);
        setLoadedProjectId(id);
        setCycleId((current) =>
          fresh.cycles.some((c) => c.id === current)
            ? current
            : (fresh.cycles[0]?.id ?? ""),
        );
        setError("");
      }
      return fresh;
    } finally {
      if (request === activeRequest.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!projectId || !userId) return;
    let live = true;
    const request = ++activeRequest.current;
    loadProject(projectId)
      .then((fresh) => {
        if (live && request === activeRequest.current) {
          setData(fresh);
          setLoadedProjectId(projectId);
          const requestedRunId =
            initialProjectId === projectId ? initialRunId : undefined;
          const initialRun = fresh.runs.find((r) => r.id === requestedRunId);
          if (initialRun) {
            setDetail(initialRun);
            setCycleId(initialRun.tracking_cycle_id);
          } else {
            setCycleId((current) =>
              fresh.cycles.some((c) => c.id === current)
                ? current
                : (fresh.cycles[0]?.id ?? ""),
            );
          }
          setError(
            requestedRunId && !initialRun
              ? "This result is unavailable or belongs to another project."
              : "",
          );
          setLoading(false);
        }
      })
      .catch((e) => {
        if (live) {
          setError(message(e));
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, [projectId, initialRunId, initialProjectId, userId]);
  useEffect(() => {
    const restore = () => {
      const match = window.location.pathname.match(
        /^\/projects\/([^/]+)\/(results|brands)\/([^/]+)$/,
      );
      if (!match) {
        setDetail(undefined);
        setBrandDetail(undefined);
        return;
      }
      setProjectId(match[1]);
      if (match[2] === "results") {
        const run = data.runs.find((r) => r.id === match[3]);
        setDetail(run);
        setBrandDetail(undefined);
        if (run) setCycleId(run.tracking_cycle_id);
      } else {
        setBrandDetail(match[3]);
        setDetail(undefined);
      }
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [data.runs]);
  const cycle = data.cycles.find((c) => c.id === cycleId);
  const runs = data.runs.filter((r) => r.tracking_cycle_id === cycleId);
  const filteredRuns = runs.filter(
    (r) =>
      (status === "all" || r.status === status) &&
      (engine === "all" || r.engine === engine) &&
      (topic === "all" || r.topic_snapshot === topic) &&
      r.prompt_snapshot.toLowerCase().includes(search.toLowerCase()),
  );
  function openNext() {
    const next = nextPending(filteredRuns);
    if (next) setEntry(next);
    else setNotice("No pending checks match the current filters.");
  }
  function openDetail(run: Run) {
    setDetail(run);
    window.history.pushState(
      null,
      "",
      `/projects/${run.project_id}/results/${run.id}`,
    );
  }
  function openBrand(id: string) {
    setBrandDetail(id);
    window.history.pushState(null, "", `/projects/${projectId}/brands/${id}`);
  }
  const triggerRunCheck = useCallback(
    async (run: Run) => {
      try {
        const targetBrand =
          data.brands.find((b) => b.type === "target")?.name ||
          "LAX Cannabis Club";
        setNotice(
          `Starting automated Consumer UI check on ChatGPT for "${run.prompt_snapshot}"…`,
        );
        setData((prev) => ({
          ...prev,
          runs: prev.runs.map((r) =>
            r.id === run.id
              ? { ...r, status: "queued", collection_method: "ui" }
              : r,
          ),
        }));

        const res = await fetch("/api/run-check", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: session?.access_token
              ? `Bearer ${session.access_token}`
              : "",
          },
          body: JSON.stringify({
            runId: run.id,
            targetBrand,
          }),
        });

        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.error || "Failed to trigger automated check");
        }
      } catch (err) {
        setError(message(err));
      }
    },
    [data.brands, session],
  );

  const triggerOpenAICheck = useCallback(
    async (promptId: string, runId?: string) => {
      if (!cycleId || !projectId) return;
      try {
        setApiRunningPromptId(promptId);
        const promptObj = data.prompts.find((p) => p.id === promptId);
        const promptText = promptObj?.prompt || "prompt";
        const targetBrand =
          data.brands.find((b) => b.type === "target")?.name ||
          "LAX Cannabis Club";

        setNotice(
          `Executing OpenAI Responses API check (GPT-5.6 Luna + Web Search) for "${promptText}"…`,
        );

        const res = await fetch("/api/run-openai", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: session?.access_token
              ? `Bearer ${session.access_token}`
              : "",
          },
          body: JSON.stringify({
            promptId,
            cycleId,
            projectId,
            runId,
            targetBrand,
            forceNew: true,
          }),
        });

        const result = await res.json();
        if (!res.ok || !result.success) {
          throw new Error(result.error || "Failed to execute OpenAI API check");
        }

        const mentioned = result.analysis?.target_brand_mentioned;
        const pos = result.analysis?.target_brand_position;
        setNotice(
          `OpenAI API check complete! Target mentioned: ${
            mentioned ? `Yes (Position #${pos})` : "No"
          }. Tokens: ${result.usage?.totalTokens ?? "N/A"} (Cost: $${(result.estimatedCost ?? 0).toFixed(4)})`,
        );

        const fresh = await refresh(projectId);
        if (result.runId && fresh) {
          const completedRun = fresh.runs.find((r) => r.id === result.runId);
          if (completedRun) {
            setDetail(completedRun);
          }
        }
      } catch (err) {
        setError(message(err));
      } finally {
        setApiRunningPromptId(null);
      }
    },
    [cycleId, projectId, data.prompts, data.brands, session, refresh],
  );

  useEffect(() => {
    const hasActiveRun = data.runs.some((r) =>
      ["queued", "running", "capturing", "analyzing"].includes(r.status),
    );
    if (!hasActiveRun || !projectId) return;

    const timer = setInterval(() => {
      void refresh(projectId);
    }, 2500);

    return () => clearInterval(timer);
  }, [data.runs, projectId, refresh]);

  function go(next: Tab) {
    window.history.replaceState(null, "", "/");
    setTab(next);
    setDetail(undefined);
    setBrandDetail(undefined);
    setMobile(false);
  }
  async function authenticate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    try {
      const f = new FormData(e.currentTarget);
      const credentials = authSchema.parse({
        email: f.get("email"),
        password: f.get("password"),
      });
      const { error } = await supabase().auth.signInWithPassword(credentials);
      if (error) throw new Error(error.message);
    } catch (e) {
      setAuthError(message(e));
    } finally {
      setAuthBusy(false);
    }
  }
  function report() {
    const target = data.brands.find((b) => b.type === "target");
    const m = metrics(runs, data.mentions, target?.id);
    exportCsv(`${project?.name ?? "signal"}-${cycle?.name ?? "report"}.csv`, [
      ["Consumer AI Visibility", "Manual", "Consumer", "Free", "Logged Out"],
      ["Project", project?.name ?? ""],
      ["Cycle", cycle?.name ?? ""],
      ["Completed checks", m.completed],
      ["Visibility (%)", m.visibility],
      ["Average position", m.averagePosition],
      ["Top 3 presence (%)", m.top3],
      ["Citation rate (%)", m.citationRate],
      ["Share of voice (%)", m.shareOfVoice],
      [],
      [
        "Prompt",
        "Topic",
        "Engine",
        "Status",
        "Target mentioned",
        "Position",
        "Cited",
        "Checked at",
        "Response",
        "Notes",
      ],
      ...runs.map((r) => [
        r.prompt_snapshot,
        r.topic_snapshot,
        ENGINE_NAMES[r.engine],
        r.status,
        r.target_mentioned ? "Yes" : "No",
        r.target_position,
        r.target_cited ? "Yes" : "No",
        r.checked_at,
        r.response_text,
        r.notes,
      ]),
    ]);
  }
  if (authLoading)
    return (
      <div className="auth-page">
        <div className="wordmark">
          <Activity />
          signal<span>Loading workspace…</span>
        </div>
      </div>
    );
  if (configured && !session)
    return (
      <div className="auth-page">
        <div className="auth-story">
          <div className="wordmark">
            <Activity />
            signal
          </div>
          <div>
            <span className="eyebrow">CONSUMER AI VISIBILITY</span>
            <h1>
              Know where your
              <br />
              brand shows up.
            </h1>
            <p>
              A clear picture of your brand across AI answers.
              <br />
              Measured manually. Built on evidence.
            </p>
            <div className="auth-engines">
              {ENGINES.map((e) => (
                <span key={e}>
                  <i className={`engine-dot ${e}`} />
                  {ENGINE_NAMES[e]}
                </span>
              ))}
            </div>
          </div>
          <span className="small muted">
            Your team&apos;s workspace for the new search landscape.
          </span>
        </div>
        <div className="auth-card">
          <h2>Welcome back</h2>
          <p className="muted">Sign in to your visibility workspace.</p>
          <form onSubmit={authenticate} className="form-stack">
            <Field label="Email">
              <input
                name="email"
                type="email"
                required
                autoComplete="username"
              />
            </Field>
            <Field label="Password">
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </Field>
            {authError && (
              <p role="alert" className="error">
                {authError}
              </p>
            )}
            <Button disabled={authBusy}>
              {authBusy ? "Signing in…" : "Sign in"}
              <ArrowRight size={16} />
            </Button>
          </form>
          <p className="muted small">
            Internal access only. Ask your administrator for an account or
            password reset.
          </p>
        </div>
      </div>
    );
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "mobile-open" : ""}`}>
        <div className="wordmark">
          <span className="logo-mark">
            <Activity size={23} />
          </span>
          signal<span className="product-tag">WORKSPACE</span>
        </div>
        <div className="workspace-label">PROJECT</div>
        <div className="project-picker">
          <span className="brand-avatar">
            {project?.logo_url ? (
              <img src={project.logo_url} alt="" className="project-logo" />
            ) : (
              (project?.name?.slice(0, 1) ?? "S")
            )}
          </span>
          <select
            aria-label="Select project"
            value={projectId}
            disabled={!projects.length}
            onChange={(e) => {
              setLoading(true);
              setProjectId(e.target.value);
              setData(EMPTY_DATA);
              setCycleId("");
              setDetail(undefined);
              setBrandDetail(undefined);
              setTopic("all");
            }}
          >
            <option value="" disabled>
              Your workspace
            </option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <ChevronDown size={14} />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="new-project"
          disabled={!configured}
          onClick={() => setForm("project")}
        >
          <Plus size={14} />
          New project
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="new-project"
          disabled={!projectId}
          onClick={() => {
            setEditingProject(true);
            setForm("project");
          }}
        >
          <Settings2 size={14} />
          Project settings
        </Button>
        <div className="workspace-label nav-label">WORKSPACE</div>
        <nav>
          {nav.map(({ name, icon: Icon }) => (
            <button
              className={tab === name ? "active" : ""}
              key={name}
              onClick={() => go(name)}
            >
              <Icon size={18} />
              {name}
              {name === "Prompts" && data.prompts.length > 0 && (
                <span className="nav-count">{data.prompts.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="collection-card">
            <span className="live-dot" />
            <strong>Human-powered insights</strong>
            <p>
              Consumer interfaces.
              <br />
              Real-world brand visibility.
            </p>
            <button onClick={() => setMethod(true)}>
              Our methodology
              <ArrowUpRightIcon />
            </button>
          </div>
          <button className="method-button" onClick={() => setMethod(true)}>
            <BookOpen size={17} />
            Methodology
          </button>
          <div className="account">
            <div className="account-avatar">
              {session?.user.email?.slice(0, 1).toUpperCase() ?? "S"}
            </div>
            <div>
              <strong>
                {session?.user.email?.split("@")[0] ?? "Your workspace"}
              </strong>
              <small>Internal workspace</small>
            </div>
            {session && (
              <button
                aria-label="Sign out"
                className="icon-button"
                onClick={async () => {
                  const { error } = await supabase().auth.signOut();
                  if (error) setError(error.message);
                }}
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </aside>
      {mobile && (
        <button
          className="mobile-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div>
            <button
              className="mobile-toggle icon-button"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <PanelLeft size={20} />
            </button>
            <span className="muted">Workspace</span>
            <span className="breadcrumb-slash">/</span>
            <strong>{project?.name ?? "Consumer AI Visibility"}</strong>
          </div>
          <div>
            <span className="manual-pill">
              <span className="live-dot" />
              Manual tracking
            </span>
            <button
              className="avatar-button"
              aria-label="View methodology"
              onClick={() => setMethod(true)}
            >
              {project?.name?.slice(0, 1) ?? "S"}
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {project?.domain ?? "A CLEARER VIEW OF AI SEARCH"}
                {project?.location && (
                  <>
                    <span> · </span>
                    {project.location}
                  </>
                )}
              </div>
              <h1>
                {detail
                  ? "Result details"
                  : brandDetail
                    ? data.brands.find((b) => b.id === brandDetail)?.name
                    : tab === "Overview"
                      ? "Visibility overview"
                      : tab}
              </h1>
              <p>
                {detail
                  ? "Evidence behind your manual measurement."
                  : brandDetail
                    ? "Brand performance in the selected tracking cycle."
                    : {
                        Overview:
                          "Understand how your brand appears in the answers that matter.",
                        Prompts:
                          "Your questions. Four platforms. One clear view.",
                        Competitors:
                          "See who appears alongside your brand in AI answers.",
                        Sources:
                          "Explore the sources cited in consumer AI responses.",
                        History:
                          "Track your progress, one measurement cycle at a time.",
                      }[tab]}
              </p>
            </div>
            <div className="heading-actions">
              {detail || brandDetail ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setDetail(undefined);
                    setBrandDetail(undefined);
                    window.history.replaceState(null, "", "/");
                  }}
                >
                  <ArrowLeft size={15} />
                  Back
                </Button>
              ) : (
                <>
                  <Button variant="outline" disabled={!cycle} onClick={report}>
                    <Download size={15} />
                    Export report
                  </Button>
                  <Button
                    disabled={!projectId || projectLoading}
                    onClick={() =>
                      setForm(
                        tab === "Prompts"
                          ? "prompt"
                          : tab === "Competitors"
                            ? "brand"
                            : "cycle",
                      )
                    }
                  >
                    <Plus size={16} />
                    {tab === "Prompts"
                      ? "Add prompt"
                      : tab === "Competitors"
                        ? "Add competitor"
                        : "New cycle"}
                  </Button>
                </>
              )}
            </div>
          </div>
          {!configured ? (
            <div className="setup-banner">
              <div>
                <strong>Connect your Supabase workspace</strong>
                <p>
                  Add the two environment variables from{" "}
                  <code>.env.example</code>, apply the migration, and restart
                  the app. Your real project data will appear here.
                </p>
              </div>
              <span className="badge">Setup required</span>
            </div>
          ) : null}
          {error && (
            <div className="error error-banner" role="alert">
              {error}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void (
                    projectId ? refresh(projectId) : refreshProjects()
                  ).catch((e) => setError(message(e)))
                }
              >
                Retry
              </Button>
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button
                onClick={() => setNotice("")}
                aria-label="Dismiss notification"
              >
                ×
              </button>
            </div>
          )}
          {projectId && (
            <div className="cycle-toolbar">
              <div>
                <Clock3 size={15} />
                <span>Tracking cycle</span>
                <select
                  aria-label="Tracking cycle"
                  value={cycleId}
                  onChange={(e) => {
                    setCycleId(e.target.value);
                    setDetail(undefined);
                    setTopic("all");
                  }}
                  disabled={!data.cycles.length}
                >
                  {!data.cycles.length && (
                    <option value="">No cycles yet</option>
                  )}
                  {data.cycles.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {cycle && (
                  <span
                    className={`status ${cycle.status === "completed" ? "complete" : "pending"}`}
                  >
                    {cycle.status.replaceAll("_", " ")}
                  </span>
                )}
              </div>
              <span className="small muted">
                {data.prompts.filter((p) => p.active).length} active prompts · 4
                engines
              </span>
            </div>
          )}
          {projectLoading ? (
            <div className="loading-state" role="status">
              <div className="loading-bar" />
              Loading project data…
            </div>
          ) : detail ? (
            <ResultDetail
              key={detail.id}
              run={data.runs.find((r) => r.id === detail.id) || detail}
              data={data}
              onEdit={() => setEntry(data.runs.find((r) => r.id === detail.id) || detail)}
              onRunAutomated={(r) => void triggerRunCheck(r)}
              onRunOpenAI={(r) => void triggerOpenAICheck(r.prompt_id, r.id)}
            />
          ) : brandDetail ? (
            <>
              {data.brands.find((b) => b.id === brandDetail)?.type ===
                "competitor" && (
                <Button
                  className="edit-brand-button"
                  variant="outline"
                  onClick={() => {
                    setEditingBrand(true);
                    setForm("brand");
                  }}
                >
                  Edit competitor
                </Button>
              )}
              <Competitors
                data={{
                  ...data,
                  brands: data.brands.filter((b) => b.id === brandDetail),
                }}
                runs={runs}
                onBrand={() => {}}
              />
              <section className="panel">
                <div className="panel-heading">
                  <h3>Appearances & evidence</h3>
                </div>
                {data.mentions
                  .filter(
                    (m) =>
                      m.brand_id === brandDetail &&
                      runs.some(
                        (r) =>
                          r.id === m.prompt_run_id && r.status === "complete",
                      ),
                  )
                  .map((m) => {
                    const r = runs.find((r) => r.id === m.prompt_run_id)!;
                    return (
                      <button
                        className="appearance-row"
                        key={m.id}
                        onClick={() => openDetail(r)}
                      >
                        <span>
                          {r.prompt_snapshot}
                          <small>{ENGINE_NAMES[r.engine]}</small>
                        </span>
                        <span>
                          #{m.position ?? "—"} · {m.mention_count} mentions
                          <ArrowRight size={15} />
                        </span>
                      </button>
                    );
                  })}
              </section>
            </>
          ) : configured && !projects.length ? (
            <section className="panel onboarding">
              <Empty
                title="A new perspective on your brand"
                description="Create your first project, add the prompts your customers ask, and start a manual tracking cycle."
                action={
                  <Button onClick={() => setForm("project")}>
                    <Plus size={16} />
                    Create your first project
                  </Button>
                }
              />
              <div className="onboarding-steps">
                {[
                  "Create a brand project",
                  "Add customer prompts",
                  "Record your AI checks",
                ].map((s, i) => (
                  <div key={s}>
                    <span>{i + 1}</span>
                    <strong>{s}</strong>
                  </div>
                ))}
              </div>
            </section>
          ) : tab === "Overview" ? (
            <Overview
              data={data}
              runs={runs}
              cycle={cycle}
              onNext={() => {
                const r = nextPending(runs);
                if (r) setEntry(r);
              }}
              onPrompts={() => go("Prompts")}
            />
          ) : tab === "Prompts" ? (
            <>
              <div className="filter-bar">
                <div className="search-input">
                  <Search size={16} />
                  <input
                    aria-label="Search prompts"
                    placeholder="Search prompts…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="segmented">
                  {["all", "pending", "complete"].map((s) => (
                    <button
                      key={s}
                      className={status === s ? "selected" : ""}
                      onClick={() => setStatus(s)}
                    >
                      {s === "all"
                        ? "All checks"
                        : s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
                <select
                  aria-label="Filter by engine"
                  value={engine}
                  onChange={(e) => setEngine(e.target.value)}
                >
                  <option value="all">All engines</option>
                  {ENGINES.map((e) => (
                    <option value={e} key={e}>
                      {ENGINE_NAMES[e]}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Filter by topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                >
                  <option value="all">All topics</option>
                  {[
                    ...new Set(
                      cycle
                        ? runs.map((r) => r.topic_snapshot)
                        : data.prompts.map((p) => p.topic),
                    ),
                  ].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <Button
                  disabled={!filteredRuns.some((r) => r.status === "pending")}
                  onClick={openNext}
                  title="Open the next pending check"
                >
                  Next Pending
                  <ArrowRight size={15} />
                </Button>
                {filteredRuns.some(
                  (r) => r.status === "pending" && r.engine === "chatgpt",
                ) && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      const nextGpt = filteredRuns.find(
                        (r) => r.status === "pending" && r.engine === "chatgpt",
                      );
                      if (nextGpt) void triggerRunCheck(nextGpt);
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontWeight: 600,
                    }}
                    title="Auto-run the next pending ChatGPT check via Consumer UI"
                  >
                    <Play size={12} fill="currentColor" />
                    Auto-Run Next (UI)
                  </Button>
                )}
                {cycle && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      const prerollPrompt =
                        data.prompts.find((p) =>
                          p.prompt.toLowerCase().includes("preroll"),
                        ) || data.prompts[0];
                      if (prerollPrompt) {
                        void triggerOpenAICheck(prerollPrompt.id);
                      }
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontWeight: 600,
                      color: "#7928ca",
                      borderColor: "#7928ca",
                    }}
                    title="Run official OpenAI API check with Web Search enabled"
                  >
                    <Sparkles size={12} fill="currentColor" />
                    Run OpenAI API Check
                  </Button>
                )}
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h3>Prompt tracking matrix</h3>
                    <p>
                      {cycle
                        ? "Select any check to record a result or review its evidence."
                        : "Add prompts, then create a cycle to generate pending checks."}
                    </p>
                  </div>
                  <SlidersHorizontal size={17} />
                </div>
                {data.prompts.length ? (
                  <div className="table-wrap">
                    <table className="matrix">
                      <thead>
                        <tr>
                          <th>Prompt</th>
                          {ENGINES.filter(
                            (e) => engine === "all" || e === engine,
                          ).map((e) => (
                            <th key={e}>
                              <span className={`engine-dot ${e}`} />
                              {ENGINE_NAMES[e]}
                            </th>
                          ))}
                          <th>
                            <span className="sr-only">Edit</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.prompts
                          .filter((p) =>
                            cycle
                              ? filteredRuns.some((r) => r.prompt_id === p.id)
                              : p.prompt
                                  .toLowerCase()
                                  .includes(search.toLowerCase()) &&
                                (topic === "all" || p.topic === topic),
                          )
                          .map((p) => {
                            const snapshot = runs.find(
                              (r) => r.prompt_id === p.id,
                            );
                            return (
                              <tr key={p.id}>
                                <td>
                                  <strong>
                                    {snapshot?.prompt_snapshot ?? p.prompt}
                                  </strong>
                                  <div className="prompt-meta">
                                    <span>
                                      {snapshot?.topic_snapshot ?? p.topic}
                                    </span>
                                    <span>{p.intent}</span>
                                    {!p.active && (
                                      <span>Inactive for future cycles</span>
                                    )}
                                  </div>
                                </td>
                                {ENGINES.filter(
                                  (e) => engine === "all" || e === engine,
                                ).map((e) => {
                                  const cellRuns = runs
                                    .filter(
                                      (r) =>
                                        r.prompt_id === p.id && r.engine === e,
                                    )
                                    .sort(
                                      (a, b) =>
                                        new Date(b.created_at).getTime() -
                                        new Date(a.created_at).getTime(),
                                    );
                                  return (
                                    <td key={e}>
                                      {cellRuns.length > 0 ? (
                                        <div
                                          style={{
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: 6,
                                            alignItems: "flex-start",
                                          }}
                                        >
                                          {cellRuns.map((run) => (
                                            <div
                                              key={run.id}
                                              style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 6,
                                                flexWrap: "wrap",
                                              }}
                                            >
                                              <button
                                                className={`status status-button ${run.status}`}
                                                onClick={() =>
                                                  run.status === "pending"
                                                    ? setEntry(run)
                                                    : openDetail(run)
                                                }
                                              >
                                                {run.status === "complete" ? (
                                                  <Check size={12} />
                                                ) : [
                                                    "queued",
                                                    "running",
                                                    "capturing",
                                                    "analyzing",
                                                  ].includes(run.status) ? (
                                                  <span className="live-dot" />
                                                ) : run.status === "pending" ? (
                                                  <Clock3 size={12} />
                                                ) : null}
                                                {run.status
                                                  .replaceAll("_", " ")
                                                  .charAt(0)
                                                  .toUpperCase() +
                                                  run.status
                                                    .replaceAll("_", " ")
                                                    .slice(1)}
                                                {run.status === "complete" &&
                                                  run.target_mentioned && (
                                                    <span className="rank">
                                                      {run.target_position
                                                        ? `#${run.target_position}`
                                                        : "Yes"}
                                                    </span>
                                                  )}
                                                {run.collection_method === "api" && (
                                                  <span
                                                    style={{
                                                      background: "#7928ca",
                                                      color: "#fff",
                                                      fontSize: 9,
                                                      fontWeight: 700,
                                                      padding: "1px 4px",
                                                      borderRadius: 3,
                                                      marginLeft: 4,
                                                    }}
                                                  >
                                                    API
                                                  </span>
                                                )}
                                                {run.collection_method === "ui" && (
                                                  <span
                                                    style={{
                                                      background: "#0070f3",
                                                      color: "#fff",
                                                      fontSize: 9,
                                                      fontWeight: 700,
                                                      padding: "1px 4px",
                                                      borderRadius: 3,
                                                      marginLeft: 4,
                                                    }}
                                                  >
                                                    UI
                                                  </span>
                                                )}
                                              </button>
                                            </div>
                                          ))}
                                          {e === "chatgpt" && (
                                            <div
                                              style={{
                                                display: "flex",
                                                gap: 4,
                                                flexWrap: "wrap",
                                                marginTop: 2,
                                              }}
                                            >
                                              <button
                                                className="run-api-check-btn"
                                                title="Run official OpenAI API check with Web Search enabled"
                                                style={{
                                                  background: "#7928ca",
                                                  color: "#fff",
                                                  border: "none",
                                                  borderRadius: 6,
                                                  padding: "4px 8px",
                                                  fontSize: 11,
                                                  fontWeight: 600,
                                                  cursor: "pointer",
                                                  display: "inline-flex",
                                                  alignItems: "center",
                                                  gap: 4,
                                                  whiteSpace: "nowrap",
                                                }}
                                                disabled={apiRunningPromptId === p.id}
                                                onClick={(evt) => {
                                                  evt.stopPropagation();
                                                  void triggerOpenAICheck(p.id);
                                                }}
                                              >
                                                <Sparkles size={10} fill="currentColor" />
                                                {apiRunningPromptId === p.id
                                                  ? "Calling API…"
                                                  : "Run OpenAI API Check"}
                                              </button>
                                              {cellRuns.some(
                                                (r) =>
                                                  r.collection_method !== "api" &&
                                                  r.status === "pending",
                                              ) && (
                                                <button
                                                  className="run-check-btn"
                                                  title="Run automated check via Consumer UI"
                                                  style={{
                                                    background: "var(--primary, #1e3a2b)",
                                                    color: "#fff",
                                                    border: "none",
                                                    borderRadius: 6,
                                                    padding: "4px 8px",
                                                    fontSize: 11,
                                                    fontWeight: 600,
                                                    cursor: "pointer",
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    gap: 4,
                                                    whiteSpace: "nowrap",
                                                  }}
                                                  disabled={[
                                                    "queued",
                                                    "running",
                                                    "capturing",
                                                    "analyzing",
                                                  ].includes(
                                                    cellRuns.find(
                                                      (r) => r.collection_method !== "api",
                                                    )?.status || "",
                                                  )}
                                                  onClick={(evt) => {
                                                    evt.stopPropagation();
                                                    const uiRun =
                                                      cellRuns.find(
                                                        (r) => r.collection_method !== "api",
                                                      ) || cellRuns[0];
                                                    void triggerRunCheck(uiRun);
                                                  }}
                                                >
                                                  <Play size={10} fill="currentColor" />
                                                  Run UI Check
                                                </button>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <div
                                          style={{
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: 4,
                                            alignItems: "flex-start",
                                          }}
                                        >
                                          <button
                                            className="status status-button pending"
                                            title="Include this check in current cycle"
                                            style={{
                                              fontSize: 11,
                                              cursor: "pointer",
                                              whiteSpace: "nowrap",
                                            }}
                                            onClick={async () => {
                                              try {
                                                await supabase()
                                                  .from("prompt_runs")
                                                  .insert({
                                                    tracking_cycle_id: cycleId,
                                                    project_id: projectId,
                                                    prompt_id: p.id,
                                                    engine: e,
                                                    prompt_snapshot: p.prompt,
                                                    topic_snapshot: p.topic,
                                                    status: "pending",
                                                  });
                                                await refresh(projectId);
                                              } catch (err) {
                                                setError(message(err));
                                              }
                                            }}
                                          >
                                            + Add check
                                          </button>
                                          {e === "chatgpt" && (
                                            <button
                                              className="run-api-check-btn"
                                              title="Run official OpenAI API check with Web Search enabled"
                                              style={{
                                                background: "#7928ca",
                                                color: "#fff",
                                                border: "none",
                                                borderRadius: 6,
                                                padding: "4px 8px",
                                                fontSize: 11,
                                                fontWeight: 600,
                                                cursor: "pointer",
                                                display: "inline-flex",
                                                alignItems: "center",
                                                gap: 4,
                                                whiteSpace: "nowrap",
                                              }}
                                              disabled={apiRunningPromptId === p.id}
                                              onClick={(evt) => {
                                                evt.stopPropagation();
                                                void triggerOpenAICheck(p.id);
                                              }}
                                            >
                                              <Sparkles size={10} fill="currentColor" />
                                              {apiRunningPromptId === p.id
                                                ? "Calling API…"
                                                : "Run OpenAI API Check"}
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </td>
                                  );
                                })}
                                <td>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label={`Edit prompt: ${p.prompt}`}
                                    onClick={() => {
                                      setEditPrompt(p);
                                      setForm("prompt");
                                    }}
                                  >
                                    <MoreHorizontal size={17} />
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                    {cycle && !filteredRuns.length && (
                      <Empty
                        title="No checks match these filters"
                        description="Try a different engine, topic, or status."
                      />
                    )}
                  </div>
                ) : (
                  <Empty
                    title="Start with a customer question"
                    description="Add prompts that reflect how people discover your brand. Each active prompt gets four checks per cycle."
                    action={
                      <Button
                        disabled={!projectId}
                        onClick={() => setForm("prompt")}
                      >
                        <Plus size={15} />
                        Add your first prompt
                      </Button>
                    }
                  />
                )}
              </section>
              {cycle &&
                data.prompts.some(
                  (p) => !runs.some((r) => r.prompt_id === p.id),
                ) && (
                  <p className="muted small">
                    Prompts added after this cycle started will appear in your
                    next cycle.
                  </p>
                )}
            </>
          ) : tab === "Competitors" ? (
            <Competitors data={data} runs={runs} onBrand={openBrand} />
          ) : tab === "Sources" ? (
            <Sources key={cycleId} data={data} runs={runs} onRun={openDetail} />
          ) : (
            <History
              data={data}
              onCycle={(id) => {
                setCycleId(id);
                go("Overview");
              }}
            />
          )}
          <footer>
            <span>Signal · Consumer AI Visibility</span>
            <button onClick={() => setMethod(true)}>
              Collection methodology
              <ExternalLink size={12} />
            </button>
          </footer>
        </main>
      </div>
      {form && (
        <FormDialog
          key={`${form}-${editPrompt?.id ?? ""}`}
          kind={form}
          projectId={projectId}
          project={editingProject ? project : undefined}
          brand={
            editingProject
              ? data.brands.find((b) => b.type === "target")
              : editingBrand
                ? data.brands.find((b) => b.id === brandDetail)
                : undefined
          }
          aliases={
            editingProject
              ? data.aliases.filter(
                  (a) =>
                    a.brand_id ===
                    data.brands.find((b) => b.type === "target")?.id,
                )
              : []
          }
          prompt={editPrompt}
          activeCount={data.prompts.filter((p) => p.active).length}
          onClose={() => {
            setForm(null);
            setEditPrompt(undefined);
            setEditingProject(false);
            setEditingBrand(false);
          }}
          onSaved={async (id) => {
            if (form === "project") {
              await refreshProjects();
              if (id) setProjectId(id);
              if (editingProject) await refresh(projectId);
            } else {
              await refresh(projectId);
              if (form === "cycle" && id) setCycleId(id);
            }
            setNotice(
              form === "cycle"
                ? "Tracking cycle created. Your manual checks are ready."
                : "Saved successfully.",
            );
          }}
        />
      )}
      {entry && (
        <ResultEntry
          key={entry.id}
          run={entry}
          data={data}
          onRunAutomated={triggerRunCheck}
          onClose={() => setEntry(undefined)}
          onSaved={async (next) => {
            const savedId = entry.id;
            const fresh = await refresh(projectId);
            if (detail?.id === savedId)
              setDetail(fresh.runs.find((r) => r.id === savedId));
            const scope = fresh.runs.filter(
              (r) =>
                r.tracking_cycle_id === cycleId &&
                (engine === "all" || r.engine === engine) &&
                (topic === "all" || r.topic_snapshot === topic) &&
                r.prompt_snapshot.toLowerCase().includes(search.toLowerCase()),
            );
            const nextRun = next ? nextPending(scope, savedId) : undefined;
            setEntry(nextRun);
            setNotice(
              next && !nextRun
                ? "Result saved. No pending checks remain in this view."
                : "Result saved.",
            );
          }}
        />
      )}
      <Modal
        open={method}
        onOpenChange={setMethod}
        title="Consumer AI Visibility"
        description="A consistent methodology for manual brand measurement."
      >
        <div className="methodology-grid">
          {[
            ["Collection method", "Manual"],
            ["Interface", "Consumer"],
            ["Tier", "Free"],
            ["Authentication state", "Logged Out"],
          ].map(([a, b]) => (
            <div key={a}>
              <small>{a}</small>
              <strong>{b}</strong>
            </div>
          ))}
        </div>
        <h3>Supported platforms</h3>
        <div className="method-engines">
          {ENGINES.map((e) => (
            <span className="badge" key={e}>
              {ENGINE_NAMES[e]}
            </span>
          ))}
        </div>
        <p className="method-text">
          The purpose is to measure what a normal anonymous visitor can see in
          the public consumer AI interfaces. A person performs every query and
          records the answer, brands, sources, and screenshots.
        </p>
        <div className="info-box">
          <strong>How metrics are calculated</strong>
          <p>
            Only complete checks enter metric denominators. Visibility and
            citation rate use all complete checks. Top 3 presence is the share
            of complete checks where the target is mentioned at position 1–3.
            Average position uses ranked target mentions. Share of voice uses
            recorded mention counts across all brands, including the target.
            Missing data displays as —.
          </p>
          <p>
            Cycles finish when every check is complete, skipped, or error. The
            progress percentage still shows complete checks / total checks.
            Changes between cycles are percentage points; coverage can differ
            between cycles.
          </p>
        </div>
      </Modal>
    </div>
  );
}
function ArrowUpRightIcon() {
  return <ArrowRight size={13} />;
}

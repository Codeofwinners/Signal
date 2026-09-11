export const ENGINES = ["chatgpt", "gemini", "perplexity", "claude"] as const;
export type Engine = (typeof ENGINES)[number];
export const ENGINE_NAMES: Record<Engine, string> = {
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  perplexity: "Perplexity",
  claude: "Claude",
};
export type RunStatus =
  | "pending"
  | "queued"
  | "running"
  | "capturing"
  | "analyzing"
  | "complete"
  | "blocked"
  | "needs_review"
  | "failed"
  | "skipped"
  | "error";

export type CollectionMethod = "ui" | "api" | "manual";
export type Sentiment = "positive" | "neutral" | "negative";
export interface Project {
  id: string;
  owner_id: string;
  name: string;
  domain: string;
  location: string;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}
export interface Brand {
  id: string;
  project_id: string;
  name: string;
  domain: string;
  type: "target" | "competitor";
  created_at: string;
}
export interface Alias {
  id: string;
  brand_id: string;
  alias: string;
}
export interface Prompt {
  id: string;
  project_id: string;
  prompt: string;
  topic: string;
  intent: "informational" | "commercial" | "transactional" | "local";
  location: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}
export interface Cycle {
  id: string;
  project_id: string;
  name: string;
  started_at: string;
  completed_at: string | null;
  status: "pending" | "in_progress" | "completed";
  created_at: string;
}
export interface Run {
  id: string;
  tracking_cycle_id: string;
  project_id: string;
  prompt_id: string;
  prompt_snapshot: string;
  topic_snapshot: string;
  engine: Engine;
  status: RunStatus;
  response_text: string;
  target_mentioned: boolean;
  target_position: number | null;
  target_cited: boolean;
  map_present: boolean;
  images_present: boolean;
  products_present: boolean;
  notes: string;
  checked_at: string | null;
  collection_method?: CollectionMethod;
  sentiment?: Sentiment | null;
  confidence?: number | null;
  raw_analysis_json?: unknown;
  screenshot_url?: string | null;
  model?: string | null;
  response_id?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  total_tokens?: number | null;
  web_search_calls?: number | null;
  estimated_cost?: number | null;
  raw_response_text?: string | null;
  created_at: string;
  updated_at: string;
}
export interface Mention {
  id: string;
  prompt_run_id: string;
  brand_id: string;
  position: number | null;
  mention_count: number;
  recommended: boolean;
  context: string;
}
export interface Citation {
  id: string;
  prompt_run_id: string;
  url: string;
  domain: string;
  title: string;
  position: number | null;
  brand_id: string | null;
  created_at: string;
}
export interface Screenshot {
  id: string;
  prompt_run_id: string;
  storage_path: string;
  created_at: string;
}
export interface ProjectData {
  brands: Brand[];
  aliases: Alias[];
  prompts: Prompt[];
  cycles: Cycle[];
  runs: Run[];
  mentions: Mention[];
  citations: Citation[];
  screenshots: Screenshot[];
}
export const EMPTY_DATA: ProjectData = {
  brands: [],
  aliases: [],
  prompts: [],
  cycles: [],
  runs: [],
  mentions: [],
  citations: [],
  screenshots: [],
};

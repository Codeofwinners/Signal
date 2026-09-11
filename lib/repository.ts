import { supabase } from "./supabase";
import { type Project, type ProjectData, type Run, type Brand } from "./types";
import {
  resultSchema,
  validateScreenshot,
  type ResultInput,
} from "./validation";
function check(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}
// Supabase's default row cap must not silently truncate project analytics.
async function all<T>(table: string, filter?: [string, string]) {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    let q = supabase()
      .from(table)
      .select("*")
      .order("id")
      .range(from, from + 499);
    if (filter) q = q.eq(...filter);
    const { data, error } = await q;
    check(error);
    rows.push(...(data as T[]));
    if (data!.length < 500) return rows;
  }
}
export async function loadProjects() {
  return (await all<Project>("projects")).sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
}
export async function loadProject(id: string): Promise<ProjectData> {
  const [brands, prompts, cycles, runs] = await Promise.all([
    all<ProjectData["brands"][number]>("brands", ["project_id", id]),
    all<ProjectData["prompts"][number]>("prompts", ["project_id", id]),
    all<ProjectData["cycles"][number]>("tracking_cycles", ["project_id", id]),
    all<Run>("prompt_runs", ["project_id", id]),
  ]);
  // Joined filtering retains pagination while fetching only children of this project.
  async function children<T>(table: string, parent: string) {
    const rows: T[] = [];
    for (let from = 0; ; from += 500) {
      const { data, error } = await supabase()
        .from(table)
        .select(`*,${parent}!inner(project_id)`)
        .eq(`${parent}.project_id`, id)
        .order("id")
        .range(from, from + 499);
      check(error);
      rows.push(...(data as T[]));
      if (data!.length < 500) return rows;
    }
  }
  const [aliases, mentions, citations, screenshots] = await Promise.all([
    children<ProjectData["aliases"][number]>("brand_aliases", "brands"),
    children<ProjectData["mentions"][number]>("mentions", "prompt_runs"),
    children<ProjectData["citations"][number]>("citations", "prompt_runs"),
    children<ProjectData["screenshots"][number]>("screenshots", "prompt_runs"),
  ]);
  return {
    brands,
    aliases,
    prompts: prompts.sort((a, b) => a.created_at.localeCompare(b.created_at)),
    cycles: cycles.sort(
      (a, b) =>
        b.started_at.localeCompare(a.started_at) ||
        b.created_at.localeCompare(a.created_at),
    ),
    runs: runs.sort(
      (a, b) =>
        a.created_at.localeCompare(b.created_at) ||
        a.prompt_id.localeCompare(b.prompt_id) ||
        a.engine.localeCompare(b.engine),
    ),
    mentions,
    citations,
    screenshots,
  };
}
export async function addBrand(
  projectId: string,
  brand: { name: string; domain: string },
) {
  const { data, error } = await supabase()
    .from("brands")
    .insert({ ...brand, project_id: projectId, type: "competitor" })
    .select()
    .single();
  check(error);
  return data as Brand;
}
export async function saveResult(run: Run, input: ResultInput, files: File[]) {
  const result = resultSchema.parse(input);
  files.forEach(validateScreenshot);
  const paths: string[] = [];
  try {
    for (const file of files) {
      const extension =
        file.type === "image/png"
          ? "png"
          : file.type === "image/webp"
            ? "webp"
            : "jpg";
      const path = `${run.project_id}/${run.id}/${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase()
        .storage.from("screenshots")
        .upload(path, file, { contentType: file.type, upsert: false });
      check(error);
      paths.push(path);
    }
    const { error } = await supabase().rpc("save_result", {
      p_run_id: run.id,
      p_expected_updated_at: run.updated_at,
      p_result: result,
      p_screenshots: paths,
    });
    check(error);
  } catch (error) {
    if (paths.length)
      await supabase().storage.from("screenshots").remove(paths);
    throw error;
  }
}
export async function signedScreenshot(path: string) {
  const { data, error } = await supabase()
    .storage.from("screenshots")
    .createSignedUrl(path, 3600);
  check(error);
  return data!.signedUrl;
}
export function exportCsv(
  filename: string,
  rows: (string | number | null)[][],
) {
  const csv = rows
    .map((row) =>
      row
        .map((value) => {
          let text = String(value ?? "");
          if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
          return `"${text.replaceAll('"', '""')}"`;
        })
        .join(","),
    )
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

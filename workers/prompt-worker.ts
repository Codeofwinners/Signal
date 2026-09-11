import type { SupabaseClient } from "@supabase/supabase-js";
import type { Run, RunStatus } from "../lib/types";
import { saveProofScreenshot } from "../services/storage";
import { analyzeScreenshot } from "../services/screenshot-analyzer";
import { updateRunStatus, saveAutomatedResult } from "../services/database";

export interface ExecuteRunOptions {
  supabase: SupabaseClient;
  run: Run;
  targetBrand: string;
  onProgress?: (status: RunStatus, detail?: string) => void;
}

export interface ExecuteRunResult {
  success: boolean;
  status: RunStatus;
  error?: string;
}

/**
 * Core worker execution pipeline for automated consumer AI collection:
 * Stored Prompt
 * → Automated Browser (Playwright)
 * → Fresh Logged Out Consumer AI Session (chatgpt.com)
 * → Submit Prompt ("Los Angeles half ounce weed")
 * → Wait For Complete Response
 * → Capture Screenshot
 * → Analyze Screenshot (Vision AI)
 * → Extract Rankings / Brands / Citations
 * → Save Result
 * → Update Existing Dashboard
 */
export async function executePromptRun(
  options: ExecuteRunOptions,
): Promise<ExecuteRunResult> {
  const { supabase, run, targetBrand, onProgress } = options;

  try {
    // 1. Set status = 'queued'
    await updateRunStatus(supabase, run.id, "queued", "ui");
    onProgress?.("queued", "Job queued for consumer UI worker");

    // 2. Launch browser & navigate to ChatGPT
    const { runPrompt } = await import("../providers/chatgpt");
    const checkResult = await runPrompt({
      prompt: run.prompt_snapshot,
      headless: true,
      onStatus: async (status, detail) => {
        await updateRunStatus(supabase, run.id, status, "ui");
        onProgress?.(status, detail);
      },
    });

    if (!checkResult.success) {
      console.warn(`Browser collection stopped: ${checkResult.error}`);

      let screenshotUrl = "";
      if (checkResult.screenshotBuffer) {
        const saved = await saveProofScreenshot({
          supabase,
          projectId: run.project_id,
          runId: run.id,
          buffer: checkResult.screenshotBuffer,
          provider: "chatgpt",
        });
        screenshotUrl = saved.screenshotUrl;
      }

      await supabase
        .from("prompt_runs")
        .update({
          status: checkResult.status,
          collection_method: "ui",
          notes: `Automated run halted: ${checkResult.error}`,
          screenshot_url: screenshotUrl || null,
        })
        .eq("id", run.id);

      return {
        success: false,
        status: checkResult.status,
        error: checkResult.error,
      };
    }

    // 3. Status = capturing: Save the screenshot proof
    onProgress?.("capturing", "Saving screenshot proof permanently");
    await updateRunStatus(supabase, run.id, "capturing", "ui");

    const { storagePath, screenshotUrl } = await saveProofScreenshot({
      supabase,
      projectId: run.project_id,
      runId: run.id,
      buffer: checkResult.screenshotBuffer,
      provider: "chatgpt",
    });

    // 4. Status = analyzing: Send to Vision AI
    onProgress?.("analyzing", "Analyzing screenshot via vision AI");
    await updateRunStatus(supabase, run.id, "analyzing", "ui");

    const analysisOutcome = await analyzeScreenshot({
      screenshotBuffer: checkResult.screenshotBuffer,
      prompt: run.prompt_snapshot,
      targetBrand,
      provider: "ChatGPT",
    });

    // 5. Save structured result and update cycle
    onProgress?.(analysisOutcome.status, "Saving structured results");
    await saveAutomatedResult({
      supabase,
      run,
      analysis: analysisOutcome.data,
      rawJson: analysisOutcome.rawJson,
      status: analysisOutcome.status,
      storagePath,
      screenshotUrl,
      responseText: checkResult.responseText,
    });

    return {
      success: true,
      status: analysisOutcome.status,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Worker run error:", errorMsg);

    await supabase
      .from("prompt_runs")
      .update({
        status: "failed",
        collection_method: "ui",
        notes: `Worker error: ${errorMsg}`,
      })
      .eq("id", run.id);

    return {
      success: false,
      status: "failed",
      error: errorMsg,
    };
  }
}

/**
 * Standalone worker polling loop.
 * Runs continuously on a machine with Playwright (like this Mac) to process queued consumer UI checks.
 */
export async function startWorkerDaemon() {
  const { createClient } = await import("@supabase/supabase-js");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("[Worker Daemon] Missing Supabase credentials.");
    return;
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log("[Worker Daemon] Started. Polling for queued Consumer UI runs...");
  let isRunning = false;

  const poll = async () => {
    if (isRunning) return;
    try {
      const { data: runs, error } = await supabase
        .from("prompt_runs")
        .select("*, projects(*)")
        .eq("status", "queued")
        .eq("collection_method", "ui")
        .order("created_at", { ascending: true })
        .limit(1);

      if (error || !runs || runs.length === 0) return;

      const run = runs[0] as Run;
      isRunning = true;
      console.log(`[Worker Daemon] Processing queued run ${run.id} for prompt "${run.prompt_snapshot}"...`);

      const targetBrand = (run as any).projects?.name || "LAX Cannabis Club";
      await executePromptRun({
        supabase,
        run,
        targetBrand,
        onProgress: (status, detail) => {
          console.log(`[Worker Daemon][${run.id}] ${status}: ${detail || ""}`);
        },
      });
      console.log(`[Worker Daemon] Completed run ${run.id}.`);
    } catch (e) {
      console.error("[Worker Daemon] Poll execution error:", e);
    } finally {
      isRunning = false;
    }
  };

  setInterval(poll, 3000);
  void poll();
}

if (
  process.argv[1]?.includes("prompt-worker") ||
  process.env.RUN_WORKER_DAEMON === "true"
) {
  void startWorkerDaemon();
}


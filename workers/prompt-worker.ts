import type { SupabaseClient } from "@supabase/supabase-js";
import type { Run, RunStatus } from "../lib/types";
import { runPrompt } from "../providers/chatgpt";
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

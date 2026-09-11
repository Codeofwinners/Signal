import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Run } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes max duration if supported

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const body = await request.json();
    const {
      runId,
      promptId,
      cycleId,
      projectId,
      targetBrand = "LAX Cannabis Club",
      forceNew = false,
      engine = "chatgpt",
      bypassRateLimit = false,
    } = body;

    // Enforce safety rate limit: max 14 queries per hour per engine
    const { checkAndRecordRateLimit } = await import("@/services/rate-limiter");
    const rateCheck = checkAndRecordRateLimit(engine, bypassRateLimit);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: rateCheck.message,
          rateLimited: true,
          retryAfterSec: rateCheck.retryAfterSec,
          currentCount: rateCheck.currentCount,
          maxPerHour: rateCheck.maxPerHour,
        },
        { status: 429 },
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Supabase environment variables not configured" },
        { status: 500 },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: authHeader ? { Authorization: authHeader } : {},
      },
    });

    let targetRun: Run | null = null;

    if (runId) {
      const { data: existingRun } = await supabase
        .from("prompt_runs")
        .select("*")
        .eq("id", runId)
        .single();
      targetRun = existingRun as Run | null;
    }

    // If targetRun is already complete, or was collected via API, or forceNew is requested:
    // create a fresh historical prompt_run record so we NEVER overwrite or wipe out an API result!
    const shouldCreateNew =
      forceNew ||
      !targetRun ||
      targetRun.status === "complete" ||
      targetRun.collection_method === "api";

    if (shouldCreateNew) {
      const pId = promptId || targetRun?.prompt_id;
      const cId = cycleId || targetRun?.tracking_cycle_id;
      const projId = projectId || targetRun?.project_id;

      if (!pId || !cId || !projId) {
        return NextResponse.json(
          { error: "promptId, cycleId, and projectId are required to create a new UI run." },
          { status: 400 },
        );
      }

      // Fetch prompt snapshot
      const { data: promptData, error: pErr } = await supabase
        .from("prompts")
        .select("*")
        .eq("id", pId)
        .single();

      if (pErr || !promptData) {
        return NextResponse.json(
          { error: `Prompt not found: ${pErr?.message}` },
          { status: 404 },
        );
      }

      // Clean up any empty pending placeholder run
      await supabase
        .from("prompt_runs")
        .delete()
        .eq("tracking_cycle_id", cId)
        .eq("prompt_id", pId)
        .eq("engine", "chatgpt")
        .eq("status", "pending")
        .eq("response_text", "");

      // Insert fresh prompt_run for Consumer UI check
      const { data: newRun, error: insertErr } = await supabase
        .from("prompt_runs")
        .insert({
          tracking_cycle_id: cId,
          project_id: projId,
          prompt_id: pId,
          engine: "chatgpt",
          collection_method: "ui",
          status: "running",
          prompt_snapshot: promptData.prompt,
          topic_snapshot: promptData.topic,
          notes: "Automated Consumer UI check started...",
        })
        .select("*")
        .single();

      if (insertErr || !newRun) {
        return NextResponse.json(
          { error: `Failed to create prompt_run: ${insertErr?.message}` },
          { status: 500 },
        );
      }

      targetRun = newRun as Run;
    } else if (targetRun) {
      // Mark existing pending run as running
      await supabase.rpc("set_run_status", {
        p_run_id: targetRun.id,
        p_status: "running",
        p_collection_method: "ui",
      });
    }

    if (!targetRun) {
      return NextResponse.json(
        { error: "Could not identify target run for execution" },
        { status: 400 },
      );
    }

    const runToExecute: Run = targetRun;

    // Execute the prompt run and await completion so Netlify Lambda doesn't freeze
    const { executePromptRun } = await import("@/workers/prompt-worker");
    const result = await executePromptRun({
      supabase,
      run: runToExecute,
      targetBrand,
      onProgress: (status, detail) => {
        console.log(`[API /api/run-check][${runToExecute.id}] Status: ${status} - ${detail || ""}`);
      },
    });

    return NextResponse.json({
      success: result.success,
      status: result.status,
      runId: runToExecute.id,
      screenshotUrl: result.screenshotUrl,
      error: result.error,
      message: "Automated consumer UI check executed",
    });
  } catch (error) {
    console.error("API /api/run-check error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { executePromptRun } from "@/workers/prompt-worker";
import type { Run } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes max duration if supported

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const body = await request.json();
    const { runId, targetBrand = "LAX Cannabis Club" } = body;

    if (!runId) {
      return NextResponse.json(
        { error: "runId is required" },
        { status: 400 },
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

    // 1. Verify access to run
    const { data: runData, error: runError } = await supabase
      .from("prompt_runs")
      .select("*")
      .eq("id", runId)
      .single();

    if (runError || !runData) {
      return NextResponse.json(
        { error: `Run not found or inaccessible: ${runError?.message}` },
        { status: 404 },
      );
    }

    const run = runData as Run;

    // 2. Set status to queued immediately
    await supabase.rpc("set_run_status", {
      p_run_id: run.id,
      p_status: "queued",
      p_collection_method: "ui",
    });

    // 3. Kick off the background worker process asynchronously
    void executePromptRun({
      supabase,
      run,
      targetBrand,
      onProgress: (status, detail) => {
        console.log(`[Worker][${run.id}] Status: ${status} - ${detail || ""}`);
      },
    }).catch((err) => {
      console.error(`[Worker][${run.id}] Fatal execution error:`, err);
    });

    return NextResponse.json({
      success: true,
      status: "queued",
      runId: run.id,
      message: "Automated consumer UI check queued and started",
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

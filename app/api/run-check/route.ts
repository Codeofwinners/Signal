import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
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

    // 2. Set status to queued immediately in Supabase
    await supabase.rpc("set_run_status", {
      p_run_id: run.id,
      p_status: "queued",
      p_collection_method: "ui",
    });

    // 3. Attempt to kick off the worker if Playwright is runnable in this environment
    void (async () => {
      try {
        const { executePromptRun } = await import("@/workers/prompt-worker");
        await executePromptRun({
          supabase,
          run,
          targetBrand,
          onProgress: (status, detail) => {
            console.log(`[Worker][${run.id}] Status: ${status} - ${detail || ""}`);
          },
        });
      } catch (err) {
        console.warn(
          `[API /api/run-check] Local browser execution not available in this container; run queued for background worker daemon:`,
          err,
        );
      }
    })();

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

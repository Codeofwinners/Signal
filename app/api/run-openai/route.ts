import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runOpenAICheck } from "@/providers/openai";
import { analyzeAPIResponse } from "@/services/api-analyzer";
import { saveAutomatedResult } from "@/services/database";
import type { Run } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120; // 2 minutes max duration

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const body = await request.json().catch(() => ({}));
    const {
      promptId,
      cycleId,
      projectId,
      runId,
      targetBrand = "LAX Cannabis Club",
    } = body;

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
      const { data, error } = await supabase
        .from("prompt_runs")
        .select("*")
        .eq("id", runId)
        .single();

      if (!error && data) {
        targetRun = data as Run;
      }
    }

    const forceNewRun = Boolean(body.forceNew);
    let pId = promptId || targetRun?.prompt_id;
    let cId = cycleId || targetRun?.tracking_cycle_id;
    let projId = projectId || targetRun?.project_id;

    if (!targetRun && pId && cId) {
      // Find if there is an existing run in this cycle for this prompt & engine
      const { data: existingRuns } = await supabase
        .from("prompt_runs")
        .select("*")
        .eq("tracking_cycle_id", cId)
        .eq("prompt_id", pId)
        .eq("engine", "chatgpt");

      const pendingRun = (existingRuns as Run[] | null)?.find(
        (r) => r.status === "pending" && !r.response_text,
      );
      if (pendingRun && !forceNewRun) {
        targetRun = pendingRun;
      }
    }

    // If targetRun is already complete, or collection_method is UI, or forceNew is requested:
    // create a fresh historical prompt_run so we never overwrite an older result.
    if (!targetRun || targetRun.status === "complete" || targetRun.collection_method === "ui" || forceNewRun) {
      pId = pId || targetRun?.prompt_id;
      cId = cId || targetRun?.tracking_cycle_id;
      projId = projId || targetRun?.project_id;

      if (!pId || !cId || !projId) {
        return NextResponse.json(
          { error: "promptId, cycleId, and projectId are required to create a new API run." },
          { status: 400 },
        );
      }

      // Fetch prompt details for the snapshot
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

      // If an untouched pending run exists for this prompt & engine, clean it up
      await supabase
        .from("prompt_runs")
        .delete()
        .eq("tracking_cycle_id", cId)
        .eq("prompt_id", pId)
        .eq("engine", "chatgpt")
        .eq("status", "pending")
        .eq("response_text", "");

      // Insert fresh historical prompt_run
      const { data: newRun, error: insertErr } = await supabase
        .from("prompt_runs")
        .insert({
          tracking_cycle_id: cId,
          project_id: projId,
          prompt_id: pId,
          engine: "chatgpt",
          collection_method: "api",
          status: "running",
          prompt_snapshot: promptData.prompt,
          topic_snapshot: promptData.topic,
          notes: "OpenAI Responses API check started...",
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
    } else {
      // Mark existing pending run as running
      await supabase
        .from("prompt_runs")
        .update({
          status: "running",
          collection_method: "api",
          notes: "OpenAI Responses API check running...",
        })
        .eq("id", targetRun.id);
    }

    // 1. Execute the official OpenAI Responses API query with Web Search enabled
    const checkResult = await runOpenAICheck({
      prompt: targetRun.prompt_snapshot,
      model: "gpt-5.6-luna",
    });

    if (!checkResult.success) {
      await supabase
        .from("prompt_runs")
        .update({
          status: "failed",
          collection_method: "api",
          notes: `OpenAI API failed: ${checkResult.error}`,
        })
        .eq("id", targetRun.id);

      return NextResponse.json(
        {
          success: false,
          runId: targetRun.id,
          status: "failed",
          error: checkResult.error,
        },
        { status: 500 },
      );
    }

    // 2. Deterministically extract visibility & ranking data (no second paid call)
    const analysis = analyzeAPIResponse({
      responseText: checkResult.responseText,
      sources: checkResult.sources,
      targetBrand,
    });

    // 3. Save structured results via save_result RPC
    await saveAutomatedResult({
      supabase,
      run: targetRun,
      analysis,
      rawJson: checkResult.rawResponse,
      status: "complete",
      responseText: checkResult.responseText,
      collectionMethod: "api",
      model: checkResult.model,
      responseId: checkResult.responseId,
      inputTokens: checkResult.usage.inputTokens,
      outputTokens: checkResult.usage.outputTokens,
      totalTokens: checkResult.usage.totalTokens,
      webSearchCalls: checkResult.toolUsage.webSearchCalls,
      estimatedCost: checkResult.estimatedCost,
      rawResponseText: checkResult.responseText,
      notes: `OpenAI Responses API (${checkResult.model}) with Web Search. Cost: $${checkResult.estimatedCost.toFixed(4)}.`,
    });

    return NextResponse.json({
      success: true,
      runId: targetRun.id,
      status: "complete",
      model: checkResult.model,
      analysis,
      usage: checkResult.usage,
      estimatedCost: checkResult.estimatedCost,
    });
  } catch (error) {
    console.error("API /api/run-openai error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}

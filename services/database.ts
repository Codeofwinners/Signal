import type { SupabaseClient } from "@supabase/supabase-js";
import type { Run, Brand, RunStatus } from "../lib/types";
import type { VisionAnalysisResult } from "../lib/validation";

export interface SaveAutomatedResultParams {
  supabase: SupabaseClient;
  run: Run;
  analysis: VisionAnalysisResult;
  rawJson: unknown;
  status: "complete" | "needs_review" | "blocked" | "failed";
  storagePath: string;
  screenshotUrl: string;
  responseText: string;
}

/**
 * Updates the prompt_run status in real time during automation
 */
export async function updateRunStatus(
  supabase: SupabaseClient,
  runId: string,
  status: RunStatus,
  collectionMethod = "ui",
): Promise<void> {
  const { error } = await supabase.rpc("set_run_status", {
    p_run_id: runId,
    p_status: status,
    p_collection_method: collectionMethod,
  });

  if (error) {
    console.warn(`Failed to update run status to ${status}:`, error.message);
  }
}

/**
 * Atomically saves the extracted automated result to Supabase:
 * - Upserts newly discovered competitor brands so they are tracked in the database
 * - Prepares mentions, citations, and screenshot records
 * - Calls the save_result RPC to persist all data and recalculate cycle metrics
 */
export async function saveAutomatedResult(
  params: SaveAutomatedResultParams,
): Promise<void> {
  const {
    supabase,
    run,
    analysis,
    rawJson,
    status,
    storagePath,
    screenshotUrl,
    responseText,
  } = params;

  // 1. Fetch current brands for this project
  const { data: existingBrands, error: brandsError } = await supabase
    .from("brands")
    .select("*")
    .eq("project_id", run.project_id);

  if (brandsError) {
    throw new Error(`Failed to fetch project brands: ${brandsError.message}`);
  }

  const brandMap = new Map<string, string>();
  for (const b of (existingBrands as Brand[]) || []) {
    brandMap.set(b.name.trim().toLowerCase(), b.id);
  }

  // 2. Ensure each extracted brand exists in the database
  const mentionsPayload = [];
  for (const item of analysis.brands_in_order) {
    const cleanName = item.brand.trim();
    if (!cleanName) continue;
    const lower = cleanName.toLowerCase();

    let brandId = brandMap.get(lower);
    if (!brandId) {
      // Insert new competitor brand
      const { data: newBrand, error: insertError } = await supabase
        .from("brands")
        .insert({
          project_id: run.project_id,
          name: cleanName,
          domain: "",
          type: "competitor",
        })
        .select("id")
        .single();

      if (!insertError && newBrand && typeof newBrand.id === "string") {
        brandId = newBrand.id;
        brandMap.set(lower, brandId);
      }
    }

    if (brandId) {
      mentionsPayload.push({
        brand_id: brandId,
        position: item.position,
        mention_count: 1,
        recommended: analysis.sentiment === "positive",
        context: "",
      });
    }
  }

  // 3. Format citations
  const citationsPayload = analysis.citations.map((c, idx) => {
    let cleanUrl = c.url?.trim() || "";
    if (!cleanUrl) {
      cleanUrl = `https://${c.domain.trim() || "example.com"}`;
    }
    return {
      url: cleanUrl,
      domain: c.domain.trim().toLowerCase() || "unknown.com",
      title: "",
      position: idx + 1,
      brand_id: null,
    };
  });

  // 4. Assemble payload
  const resultPayload = {
    status,
    collection_method: "ui",
    target_mentioned: analysis.target_brand_mentioned,
    target_position: analysis.target_brand_position,
    target_cited: citationsPayload.some((c) =>
      c.domain.includes("laxcannabisclub"),
    ),
    map_present: false,
    images_present: false,
    products_present: false,
    response_text: responseText,
    notes: `Automated Consumer UI check on ChatGPT. Confidence: ${(analysis.confidence * 100).toFixed(0)}%.`,
    sentiment: analysis.sentiment,
    confidence: analysis.confidence,
    raw_analysis_json: rawJson,
    screenshot_url: screenshotUrl,
    mentions: mentionsPayload,
    citations: citationsPayload,
  };

  // 5. Call save_result RPC
  const { error: saveError } = await supabase.rpc("save_result", {
    p_run_id: run.id,
    p_expected_updated_at: null, // Allow automated runner without optimistic concurrency lock conflict
    p_result: resultPayload,
    p_screenshots: storagePath ? [storagePath] : [],
  });

  if (saveError) {
    throw new Error(`Failed to save automated result via RPC: ${saveError.message}`);
  }
}

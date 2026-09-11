import fs from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface SaveScreenshotParams {
  supabase: SupabaseClient;
  projectId: string;
  runId: string;
  buffer: Buffer;
  provider?: string;
  contentType?: string;
  extension?: string;
}

export interface SaveScreenshotResult {
  storagePath: string;
  screenshotUrl: string;
}

/**
 * Stores proof screenshots permanently:
 * 1. Saves to local public directory (`public/screenshots/...`) if writable.
 * 2. Uploads to Supabase Storage `screenshots` bucket under `${projectId}/${runId}/...`
 *    which conforms to project-ownership RLS policies.
 */
export async function saveProofScreenshot(
  params: SaveScreenshotParams,
): Promise<SaveScreenshotResult> {
  const {
    supabase,
    projectId,
    runId,
    buffer,
    provider = "chatgpt",
    contentType = "image/png",
    extension = "png",
  } = params;
  const dateStr = new Date().toISOString().slice(0, 10);
  const timestamp = Date.now();
  const filename = `${provider}-${timestamp}.${extension}`;
  const storagePath = `${projectId}/${runId}/${filename}`;

  // 1. Save locally if filesystem is writable (may be read-only in some serverless environments)
  let localWebUrl = "";
  try {
    const localDir = path.join(
      process.cwd(),
      "public",
      "screenshots",
      provider,
      dateStr,
    );
    await fs.mkdir(localDir, { recursive: true });
    const localFilePath = path.join(localDir, `${runId}.${extension}`);
    await fs.writeFile(localFilePath, buffer);
    localWebUrl = `/screenshots/${provider}/${dateStr}/${runId}.${extension}`;
  } catch (fsErr) {
    console.warn("Local filesystem write skipped (serverless container):", fsErr);
  }

  // 2. Upload to Supabase Storage
  let supabaseSignedUrl = "";
  try {
    const { error: uploadError } = await supabase.storage
      .from("screenshots")
      .upload(storagePath, buffer, {
        contentType,
        upsert: true,
      });

    if (!uploadError) {
      const { data: signedData } = await supabase.storage
        .from("screenshots")
        .createSignedUrl(storagePath, 60 * 60 * 24 * 365); // 1 year signed URL
      if (signedData?.signedUrl) {
        supabaseSignedUrl = signedData.signedUrl;
      }
    } else {
      console.warn("Supabase storage upload warning:", uploadError.message);
    }
  } catch (err) {
    console.warn("Failed to upload to Supabase storage:", err);
  }

  // Fallback: If upload failed and no local file, use a data URL so image is NEVER missing
  let fallbackDataUrl = "";
  if (!supabaseSignedUrl && !localWebUrl) {
    fallbackDataUrl = `data:${contentType};base64,${buffer.toString("base64")}`;
  }

  return {
    storagePath,
    screenshotUrl: supabaseSignedUrl || localWebUrl || fallbackDataUrl,
  };
}

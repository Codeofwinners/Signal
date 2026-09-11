import { z } from "zod";
export function normalizeDomain(input: string) {
  const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    !url.hostname.includes(".")
  )
    throw new Error("Enter a valid website or domain.");
  return url.hostname.toLowerCase().replace(/^www\./, "");
}
const domain = z
  .string()
  .trim()
  .min(1)
  .max(253)
  .transform((v, ctx) => {
    try {
      return normalizeDomain(v);
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid website or domain",
      });
      return z.NEVER;
    }
  });
export const projectSchema = z.object({
  name: z.string().trim().min(1).max(100),
  domain,
  location: z.string().trim().max(150),
  target: z.string().trim().min(1).max(100),
  aliases: z.string().max(2000),
  logo_url: z.union([
    z.literal(""),
    z.url().refine((v) => v.startsWith("https://"), "Use an HTTPS logo URL"),
  ]),
});
export const brandSchema = z.object({
  name: z.string().trim().min(1).max(100),
  domain: z.union([z.literal(""), domain]),
});
export const promptSchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
  topic: z.string().trim().min(1).max(100),
  intent: z.enum(["informational", "commercial", "transactional", "local"]),
  location: z.string().trim().max(150),
  active: z.boolean(),
});
export const cycleSchema = z.object({
  name: z.string().trim().min(1).max(100),
  started_at: z.iso.date(),
});
const position = z.number().int().min(1).max(10000).nullable();
export const resultSchema = z
  .object({
    status: z.enum([
      "complete",
      "needs_review",
      "blocked",
      "failed",
      "skipped",
      "error",
    ]),
    target_mentioned: z.boolean(),
    target_position: position,
    target_cited: z.boolean(),
    map_present: z.boolean(),
    images_present: z.boolean(),
    products_present: z.boolean(),
    response_text: z.string().max(200000),
    notes: z.string().max(10000),
    collection_method: z.enum(["ui", "api", "manual"]).optional(),
    sentiment: z.enum(["positive", "neutral", "negative"]).nullable().optional(),
    confidence: z.number().min(0).max(1).nullable().optional(),
    raw_analysis_json: z.unknown().optional(),
    screenshot_url: z.string().nullable().optional(),
    model: z.string().nullable().optional(),
    response_id: z.string().nullable().optional(),
    input_tokens: z.number().int().nullable().optional(),
    output_tokens: z.number().int().nullable().optional(),
    total_tokens: z.number().int().nullable().optional(),
    web_search_calls: z.number().int().nullable().optional(),
    estimated_cost: z.number().nullable().optional(),
    raw_response_text: z.string().max(500000).nullable().optional(),
    mentions: z
      .array(
        z.object({
          brand_id: z.uuid(),
          position,
          mention_count: z.number().int().min(1).max(10000),
          recommended: z.boolean(),
          context: z.string().max(5000),
        }),
      )
      .max(200),
    citations: z
      .array(
        z.object({
          url: z
            .url()
            .refine((v) => /^https?:\/\//i.test(v), "Use http or https"),
          domain: z.string(),
          title: z.string().max(1000),
          position,
          brand_id: z.uuid().nullable(),
        }),
      )
      .max(500),
  })
  .superRefine((v, ctx) => {
    if (!v.target_mentioned && v.target_position !== null)
      ctx.addIssue({
        code: "custom",
        path: ["target_position"],
        message: "A position requires a target mention",
      });
    if (new Set(v.mentions.map((m) => m.brand_id)).size !== v.mentions.length)
      ctx.addIssue({
        code: "custom",
        path: ["mentions"],
        message: "Record each brand once; use mention count for repeats",
      });
  });
export type ResultInput = z.infer<typeof resultSchema>;

export const visionAnalysisSchema = z.object({
  target_brand_mentioned: z.boolean(),
  target_brand_position: z.number().int().min(1).max(10000).nullable(),
  brands_in_order: z.array(
    z.object({
      brand: z.string().trim().min(1),
      position: z.number().int().min(1).max(10000),
    }),
  ),
  citations: z.array(
    z.object({
      domain: z.string(),
      url: z.string().nullable().optional(),
    }),
  ),
  sentiment: z.enum(["positive", "neutral", "negative"]),
  confidence: z.number().min(0).max(1),
});
export type VisionAnalysisResult = z.infer<typeof visionAnalysisSchema>;
export function message(error: unknown) {
  return error instanceof z.ZodError
    ? error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    : error instanceof Error
      ? error.message
      : "Something went wrong. Please try again.";
}
export const authSchema = z.object({
  email: z.email(),
  password: z.string().min(6),
});
export function validateScreenshot(file: File) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("Screenshots must be PNG, JPEG, or WebP.");
  if (file.size > 10 * 1024 * 1024)
    throw new Error("Each screenshot must be 10 MB or smaller.");
}

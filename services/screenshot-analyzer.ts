import {
  visionAnalysisSchema,
  type VisionAnalysisResult,
} from "../lib/validation";

export interface AnalyzeScreenshotOptions {
  screenshotBuffer: Buffer;
  prompt: string;
  targetBrand: string;
  provider: string;
  apiKey?: string;
}

export interface AnalysisOutcome {
  data: VisionAnalysisResult;
  status: "complete" | "needs_review";
  rawJson: unknown;
}

/**
 * Sends the captured consumer UI screenshot to Vision AI to extract:
 * - target_brand_mentioned (boolean)
 * - target_brand_position (number | null)
 * - brands_in_order (list of brands and positions in exact order presented)
 * - citations (domain, url)
 * - sentiment ("positive" | "neutral" | "negative")
 * - confidence (0.0 to 1.0)
 *
 * Adheres strictly to requirements:
 * - Extracts only visible brands in actual presentation order.
 * - Does not invent brands.
 * - If target is absent: mentioned=false, position=null.
 * - If confidence is low (< 0.70): status = 'needs_review'.
 */
export async function analyzeScreenshot(
  options: AnalyzeScreenshotOptions,
): Promise<AnalysisOutcome> {
  const {
    screenshotBuffer,
    prompt,
    targetBrand,
    provider,
    apiKey = process.env.GEMINI_API_KEY || "",
  } = options;

  if (!apiKey) {
    console.warn("No GEMINI_API_KEY found. Returning needs_review fallback.");
    return {
      data: {
        target_brand_mentioned: false,
        target_brand_position: null,
        brands_in_order: [],
        citations: [],
        sentiment: "neutral",
        confidence: 0.1,
      },
      status: "needs_review",
      rawJson: { error: "Missing GEMINI_API_KEY for vision analysis" },
    };
  }

  const base64Image = screenshotBuffer.toString("base64");

  const systemInstruction = `
You are a high-precision AI visibility auditor analyzing a screenshot of a real consumer AI web interface (${provider}).
The search prompt entered was: "${prompt}".
The target brand being tracked is: "${targetBrand}".

Analyze the response visible in the screenshot carefully:
1. Identify all dispensaries, cannabis brands, storefronts, or product brands mentioned or recommended in the text.
2. Extract them in the EXACT ORDER they appear in the answer (position 1, 2, 3, etc.).
3. Check if the target brand ("${targetBrand}") is mentioned.
   - If present: set target_brand_mentioned = true and set target_brand_position to its numerical rank (e.g. 1 if listed first).
   - If absent: set target_brand_mentioned = false and target_brand_position = null.
4. Extract any cited web domains or URLs visible in citation pills, links, or sources.
5. Determine the sentiment toward the target brand (or overall recommendations if not mentioned): "positive", "neutral", or "negative".
6. Rate your extraction confidence from 0.0 to 1.0 based on image clarity.

CRITICAL RULES:
- Extract dispensaries/brands in the actual order presented.
- Do NOT invent brands or assume names not visible in the screenshot.
- Do NOT infer a position that is not supported by the visible response.
- Output pure JSON only matching this schema:
{
  "target_brand_mentioned": boolean,
  "target_brand_position": number or null,
  "brands_in_order": [
    { "brand": string, "position": number }
  ],
  "citations": [
    { "domain": string, "url": string or null }
  ],
  "sentiment": "positive" | "neutral" | "negative",
  "confidence": number
}
`.trim();

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const body = {
      contents: [
        {
          parts: [
            { text: systemInstruction },
            {
              inlineData: {
                mimeType: "image/png",
                data: base64Image,
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini Vision API error (${response.status}): ${errText}`);
    }

    const resJson = await response.json();
    const candidateText =
      resJson.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";

    const parsedJson = JSON.parse(candidateText);
    const validated = visionAnalysisSchema.parse(parsedJson);

    const status = validated.confidence < 0.7 ? "needs_review" : "complete";

    return {
      data: validated,
      status,
      rawJson: parsedJson,
    };
  } catch (error) {
    console.error("Screenshot analysis failed:", error);
    return {
      data: {
        target_brand_mentioned: false,
        target_brand_position: null,
        brands_in_order: [],
        citations: [],
        sentiment: "neutral",
        confidence: 0.2,
      },
      status: "needs_review",
      rawJson: { error: error instanceof Error ? error.message : String(error) },
    };
  }
}

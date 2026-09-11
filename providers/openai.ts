import OpenAI from "openai";

export interface OpenAICheckOptions {
  prompt: string;
  model?: string;
  apiKey?: string;
}

export interface OpenAICheckSource {
  title: string;
  url: string;
  domain: string;
}

export interface OpenAICheckSuccess {
  success: true;
  responseId: string;
  model: string;
  responseText: string;
  sources: OpenAICheckSource[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  toolUsage: {
    webSearchCalls: number;
  };
  estimatedCost: number;
  rawResponse: unknown;
}

export interface OpenAICheckFailure {
  success: false;
  error: string;
  rawError?: unknown;
}

export type OpenAICheckResult = OpenAICheckSuccess | OpenAICheckFailure;

/**
 * Calculates estimated cost based on configurable per-million token rates and search calls.
 */
function calculateCost(
  inputTokens: number,
  outputTokens: number,
  webSearchCalls: number,
): number {
  const inputPricePerM = Number(process.env.OPENAI_INPUT_TOKEN_PRICE_PER_M ?? "0.15");
  const outputPricePerM = Number(process.env.OPENAI_OUTPUT_TOKEN_PRICE_PER_M ?? "0.60");
  const searchPricePerCall = Number(process.env.OPENAI_WEB_SEARCH_PRICE_PER_CALL ?? "0.005");

  const cost =
    (inputTokens / 1_000_000) * inputPricePerM +
    (outputTokens / 1_000_000) * outputPricePerM +
    webSearchCalls * searchPricePerCall;

  return Math.round(cost * 1_000_000) / 1_000_000;
}

/**
 * Extracts hostname domain from a URL safely.
 */
function extractDomain(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    return parsed.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "unknown.com";
  }
}

/**
 * Executes a live query via the official OpenAI Responses API with Web Search enabled.
 * Adheres strictly to requirements:
 * - Uses official OpenAI Node SDK.
 * - Uses Responses API.
 * - Uses gpt-5.6-luna.
 * - Enables web_search tool.
 * - Collects full raw answer, sources, usage, and calculates cost.
 */
export async function runOpenAICheck(
  options: OpenAICheckOptions,
): Promise<OpenAICheckResult> {
  const {
    prompt,
    model = "gpt-5.6-luna",
    apiKey = process.env.OPENAI_API_KEY,
  } = options;

  if (!apiKey) {
    return {
      success: false,
      error: "Missing OPENAI_API_KEY in environment variables.",
    };
  }

  const client = new OpenAI({ apiKey });

  try {
    // Call official OpenAI Responses API with web search enabled
    const response = (await client.responses.create({
      model,
      input: prompt,
      tools: [{ type: "web_search" }],
      include: ["web_search_call.action.sources"] as unknown as undefined,
    })) as {
      id: string;
      model?: string;
      output?: Array<{
        type?: string;
        content?: Array<{
          type?: string;
          text?: string;
          annotations?: Array<{
            type?: string;
            title?: string;
            url?: string;
          }>;
        }>;
      }>;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        total_tokens?: number;
      };
      tool_usage?: {
        web_search?: {
          num_requests?: number;
        };
      };
    };

    // Extract assistant answer text and annotations
    let responseText = "";
    const sources: OpenAICheckSource[] = [];
    const seenUrls = new Set<string>();

    if (response.output && Array.isArray(response.output)) {
      for (const item of response.output) {
        if (item.content && Array.isArray(item.content)) {
          for (const part of item.content) {
            if (part.text) {
              responseText += part.text;
            }
            if (part.annotations && Array.isArray(part.annotations)) {
              for (const ann of part.annotations) {
                if (ann.url && !seenUrls.has(ann.url)) {
                  seenUrls.add(ann.url);
                  sources.push({
                    title: ann.title || extractDomain(ann.url),
                    url: ann.url,
                    domain: extractDomain(ann.url),
                  });
                }
              }
            }
          }
        }
      }
    }

    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    const totalTokens = response.usage?.total_tokens ?? inputTokens + outputTokens;
    const webSearchCalls = response.tool_usage?.web_search?.num_requests ?? 0;
    const estimatedCost = calculateCost(inputTokens, outputTokens, webSearchCalls);

    return {
      success: true,
      responseId: response.id,
      model: response.model || model,
      responseText: responseText.trim(),
      sources,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens,
      },
      toolUsage: {
        webSearchCalls,
      },
      estimatedCost,
      rawResponse: response,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `OpenAI Responses API error: ${errorMsg}`,
      rawError: error,
    };
  }
}

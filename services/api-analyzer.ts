import type { OpenAICheckSource } from "../providers/openai";
import type { VisionAnalysisResult } from "../lib/validation";

export interface AnalyzeAPIOptions {
  responseText: string;
  sources: OpenAICheckSource[];
  targetBrand?: string;
  targetAliases?: string[];
  targetDomain?: string;
}

/**
 * Common Los Angeles cannabis brands & dispensaries to reliably recognize in responses.
 */
const KNOWN_CANNABIS_ENTITIES = [
  "LAX Cannabis Club",
  "710 Labs",
  "No Till Kings",
  "CBX",
  "Cannabiotix",
  "Jetty",
  "Jetty Extracts",
  "Jungle Boys",
  "Traditional",
  "Catalyst",
  "STIIIZY",
  "LA Wonderland",
  "The Artist Tree",
  "MedMen",
  "Sweet Flower",
  "Gorilla Rx",
  "Erba Markets",
  "Erba",
  "Green Goddess",
  "Cornerstone Wellness",
  "Cookies",
  "Wonderbrett",
  "Alien Labs",
  "Connected Cannabis",
  "Raw Garden",
  "Wyld",
  "Kiva",
  "Jeeter",
  "Sluggers Hit",
].sort((a, b) => b.length - a.length);

/**
 * Deterministically analyzes the OpenAI Responses API text & sources
 * without triggering an extra paid model call.
 */
export function analyzeAPIResponse(options: AnalyzeAPIOptions): VisionAnalysisResult {
  const {
    responseText,
    sources,
    targetBrand = "LAX Cannabis Club",
    targetAliases = ["LAX CC", "LAXCC", "LAX Cannabis"],
    targetDomain = "laxcc.com",
  } = options;

  const lowerText = responseText.toLowerCase();

  // 1. Check if target brand is mentioned in text or citations
  const targetVariations = [targetBrand, ...targetAliases].map((t) => t.toLowerCase());
  const isTargetInText = targetVariations.some((alias) => lowerText.includes(alias));
  const isTargetInSources = sources.some(
    (s) =>
      s.domain.includes(targetDomain.replace(/\.[a-z]+$/, "")) ||
      s.url.toLowerCase().includes(targetDomain.replace(/\.[a-z]+$/, "")) ||
      targetVariations.some((v) => s.title.toLowerCase().includes(v)),
  );
  const targetMentioned = isTargetInText || isTargetInSources;

  // 2. Extract brand recommendations in the order they appear in the text
  const foundEntities: Array<{ brand: string; index: number }> = [];
  const seenBrands = new Set<string>();
  const matchedRanges: Array<[number, number]> = [];

  // Check known entities (sorted by longest name first)
  for (const entity of [targetBrand, ...KNOWN_CANNABIS_ENTITIES]) {
    const lowerEntity = entity.toLowerCase();
    const pos = lowerText.indexOf(lowerEntity);
    if (pos !== -1) {
      const end = pos + lowerEntity.length;
      const isOverlapping = matchedRanges.some(([startR, endR]) => pos < endR && end > startR);
      if (!isOverlapping && !seenBrands.has(lowerEntity)) {
        seenBrands.add(lowerEntity);
        matchedRanges.push([pos, end]);
        foundEntities.push({ brand: entity, index: pos });
      }
    }
  }

  // Also parse bold list items like "- **710 Labs**" or "1. **Jungle Boys DTLA**"
  const boldBulletRegex = /(?:^|\n)\s*(?:[-*•]|\d+\.)\s+\*\*([^*]+)\*\*/g;
  let match: RegExpExecArray | null;
  while ((match = boldBulletRegex.exec(responseText)) !== null) {
    const rawName = match[1].trim();
    const skipPhrases = [
      "best overall quality",
      "best infused options",
      "good dispensaries",
      "my actual buy",
      "premium",
      "value",
      "package date",
      "infused",
      "where to buy",
      "top picks",
      "quick picks",
      "honorable mentions",
    ];
    const isSkip =
      rawName.endsWith(":") ||
      rawName.includes(":") ||
      skipPhrases.some((skip) => rawName.toLowerCase().startsWith(skip));
    if (!isSkip && rawName.length > 2 && rawName.length < 50) {
      // Normalize brand name if it has descriptors (e.g. "710 Labs 1g prerolls" -> "710 Labs")
      let cleanName = rawName;
      for (const known of KNOWN_CANNABIS_ENTITIES) {
        if (cleanName.toLowerCase().startsWith(known.toLowerCase())) {
          cleanName = known;
          break;
        }
      }
      const lowerClean = cleanName.toLowerCase();
      const start = match.index;
      const end = start + match[0].length;
      const isOverlapping = matchedRanges.some(([startR, endR]) => start < endR && end > startR);
      if (!isOverlapping && !seenBrands.has(lowerClean)) {
        seenBrands.add(lowerClean);
        matchedRanges.push([start, end]);
        foundEntities.push({ brand: cleanName, index: match.index });
      }
    }
  }

  // Sort strictly by their first visual appearance in the response
  foundEntities.sort((a, b) => a.index - b.index);

  const brandsInOrder = foundEntities.map((item, idx) => ({
    brand: item.brand,
    position: idx + 1,
  }));

  // 3. Determine target position
  let targetPosition: number | null = null;
  if (targetMentioned) {
    const targetIdx = brandsInOrder.findIndex(
      (b) =>
        b.brand.toLowerCase() === targetBrand.toLowerCase() ||
        targetVariations.includes(b.brand.toLowerCase()),
    );
    if (targetIdx !== -1) {
      targetPosition = targetIdx + 1;
    } else {
      // Mentioned in context (e.g. under infused options or source citation)
      // Rank after brands that appeared before it in the text
      const targetFirstPos = Math.min(
        ...targetVariations
          .map((v) => lowerText.indexOf(v))
          .filter((pos) => pos !== -1),
      );
      if (Number.isFinite(targetFirstPos)) {
        const preceding = brandsInOrder.filter(
          (b) => lowerText.indexOf(b.brand.toLowerCase()) < targetFirstPos,
        ).length;
        targetPosition = preceding + 1;
      } else {
        targetPosition = brandsInOrder.length + 1;
      }
    }
  }

  // 4. Citations
  const citations = sources.map((s) => ({
    domain: s.domain,
    url: s.url,
  }));

  // 5. Sentiment
  let sentiment: "positive" | "neutral" | "negative" = "neutral";
  if (targetMentioned) {
    const targetContextSnippets = [
      "recommend",
      "best",
      "selection",
      "popular",
      "licensed",
      "quality",
      "options",
      "good",
    ];
    if (targetContextSnippets.some((kw) => lowerText.includes(kw))) {
      sentiment = "positive";
    }
  }

  return {
    target_brand_mentioned: targetMentioned,
    target_brand_position: targetPosition,
    brands_in_order: brandsInOrder,
    citations,
    sentiment,
    confidence: 0.95,
  };
}

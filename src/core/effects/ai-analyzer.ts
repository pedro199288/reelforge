/**
 * AI Analyzer using Claude API for semantic caption enrichment
 * This module is designed to be called from the backend (server/api.ts)
 */

import type { Caption } from "@/core/script/align";
import type {
  EnrichedCaption,
  EffectsAnalysisResult,
  AnalysisMetadata,
  WordSemanticScores,
} from "./types";

/**
 * Generate a hash of captions for cache validation
 */
export function hashCaptions(captions: Caption[]): string {
  const content = captions.map((c) => `${c.text}:${c.startMs}:${c.endMs}`).join("|");
  // Simple hash function - in production you might use crypto
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Detect sentence boundaries in captions
 * Returns sentence indices and positions for each caption
 */
export function detectSentenceBoundaries(
  captions: Caption[]
): Array<{ sentenceIndex: number; position: "start" | "middle" | "end" }> {
  const result: Array<{ sentenceIndex: number; position: "start" | "middle" | "end" }> = [];
  let currentSentence = 0;
  let wordsInCurrentSentence = 0;
  const sentenceEnders = /[.!?。？！]/;

  for (let i = 0; i < captions.length; i++) {
    const text = captions[i].text.trim();
    const isFirstInSentence = wordsInCurrentSentence === 0;
    const endsWithPunctuation = sentenceEnders.test(text);

    wordsInCurrentSentence++;

    // Determine position
    let position: "start" | "middle" | "end";
    if (isFirstInSentence && endsWithPunctuation) {
      // Single word sentence
      position = "start";
    } else if (isFirstInSentence) {
      position = "start";
    } else if (endsWithPunctuation) {
      position = "end";
    } else {
      position = "middle";
    }

    result.push({ sentenceIndex: currentSentence, position });

    if (endsWithPunctuation) {
      currentSentence++;
      wordsInCurrentSentence = 0;
    }
  }

  return result;
}

/**
 * System prompt for Claude to analyze captions
 */
const SYSTEM_PROMPT = `You are an AI assistant that analyzes video captions for a TikTok-style video editing tool. Your task is to identify which words/phrases deserve visual emphasis (highlights or zoom effects) based on:

1. **Topic Relevance**: How central is this word to the main topic being discussed?
2. **Emphasis Score**: Does the speaker seem to be emphasizing this word? (based on context, not audio)
3. **Emotional Intensity**: Does this word carry emotional weight?
4. **Category**: Classify each word as:
   - "action": Verbs and action words
   - "concept": Key nouns and ideas
   - "emotion": Emotional descriptors
   - "connector": Transition words (and, but, so, because)
   - "filler": Common words with low semantic value (the, a, is, etc.)

Return a JSON object with:
- mainTopic: The main subject being discussed
- topicKeywords: Array of 5-10 key terms related to the topic
- overallTone: "educational" | "entertaining" | "emotional" | "promotional" | "conversational"
- language: Detected language code (e.g., "es", "en")
- words: Array of objects for each caption word with scores (all 0-1):
  - index: Caption index
  - topicRelevance: float
  - emphasisScore: float
  - emotionalIntensity: float
  - isKeyword: boolean
  - category: string

Be concise. Focus on identifying 10-20% of words as truly noteworthy (high scores). Most filler words should have scores near 0.`;

/**
 * Build the user prompt from captions
 */
function buildUserPrompt(captions: Caption[], script?: string): string {
  const captionsList = captions
    .map((c, i) => `[${i}] ${c.text}`)
    .join("\n");

  let prompt = `Analyze these video captions:\n\n${captionsList}`;

  if (script) {
    prompt += `\n\nOriginal script (for context):\n${script}`;
  }

  prompt += "\n\nReturn JSON only, no explanation.";

  return prompt;
}

/**
 * Parse Claude's response into structured data
 */
interface ClaudeAnalysisResponse {
  mainTopic: string;
  topicKeywords: string[];
  overallTone: "educational" | "entertaining" | "emotional" | "promotional" | "conversational";
  language: string;
  words: Array<{
    index: number;
    topicRelevance: number;
    emphasisScore: number;
    emotionalIntensity: number;
    isKeyword: boolean;
    category: "action" | "concept" | "emotion" | "connector" | "filler";
  }>;
}

function parseAnalysisResponse(
  response: string,
  captions: Caption[]
): { metadata: Omit<AnalysisMetadata, "analyzedAt" | "captionsHash" | "wordCount">; scores: Map<number, WordSemanticScores> } {
  // Try to extract JSON from the response
  let json: ClaudeAnalysisResponse;

  try {
    // First try direct parse
    json = JSON.parse(response);
  } catch {
    // Try to find JSON in the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      json = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error("Could not parse JSON from response");
    }
  }

  // Build scores map
  const scores = new Map<number, WordSemanticScores>();
  for (const word of json.words) {
    scores.set(word.index, {
      topicRelevance: Math.max(0, Math.min(1, word.topicRelevance)),
      emphasisScore: Math.max(0, Math.min(1, word.emphasisScore)),
      emotionalIntensity: Math.max(0, Math.min(1, word.emotionalIntensity)),
      isKeyword: word.isKeyword,
      category: word.category,
    });
  }

  // Fill in missing words with default scores
  for (let i = 0; i < captions.length; i++) {
    if (!scores.has(i)) {
      scores.set(i, {
        topicRelevance: 0.1,
        emphasisScore: 0.1,
        emotionalIntensity: 0.1,
        isKeyword: false,
        category: "filler",
      });
    }
  }

  return {
    metadata: {
      mainTopic: json.mainTopic,
      topicKeywords: json.topicKeywords,
      overallTone: json.overallTone,
      language: json.language,
    },
    scores,
  };
}

/**
 * Analyze captions using Claude API
 * This function is meant to be called from the backend
 */
export async function analyzeWithClaude(
  captions: Caption[],
  options: {
    apiKey: string;
    script?: string;
    model?: string;
  }
): Promise<EffectsAnalysisResult> {
  const startTime = Date.now();
  const model = options.model ?? "claude-sonnet-4-20250514";

  // Import Anthropic SDK dynamically (only available in Node/Bun)
  const { default: Anthropic } = await import("@anthropic-ai/sdk");

  const client = new Anthropic({
    apiKey: options.apiKey,
  });

  // Build prompt
  const userPrompt = buildUserPrompt(captions, options.script);

  // Call Claude API
  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      { role: "user", content: userPrompt },
    ],
  });

  // Extract text content
  const textContent = response.content.find((c) => c.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error("No text response from Claude");
  }

  // Parse response
  const { metadata, scores } = parseAnalysisResponse(textContent.text, captions);

  // Detect sentence boundaries
  const boundaries = detectSentenceBoundaries(captions);

  // Build enriched captions
  const enrichedCaptions: EnrichedCaption[] = captions.map((caption, index) => {
    const semantic = scores.get(index) ?? {
      topicRelevance: 0.1,
      emphasisScore: 0.1,
      emotionalIntensity: 0.1,
      isKeyword: false,
      category: "filler" as const,
    };

    return {
      text: caption.text,
      startMs: caption.startMs,
      endMs: caption.endMs,
      whisperConfidence: caption.confidence ?? 1,
      semantic,
      sentenceIndex: boundaries[index]?.sentenceIndex,
      sentencePosition: boundaries[index]?.position,
    };
  });

  // Build result
  const result: EffectsAnalysisResult = {
    metadata: {
      ...metadata,
      wordCount: captions.length,
      analyzedAt: new Date().toISOString(),
      captionsHash: hashCaptions(captions),
    },
    enrichedCaptions,
    model,
    processingTimeMs: Date.now() - startTime,
  };

  return result;
}

/**
 * Check if cached analysis is still valid
 */
export function isCacheValid(
  cached: EffectsAnalysisResult,
  captions: Caption[]
): boolean {
  return cached.metadata.captionsHash === hashCaptions(captions);
}

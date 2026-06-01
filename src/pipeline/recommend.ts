import Anthropic from "@anthropic-ai/sdk";
import { ParsedIntent } from "./parse";
import { SearchResult } from "./search";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface Recommendation {
  title: string;
  author: string;
  genres: string;
  avgRating: number;
  reason: string; // why this book fits the user's request
}

export interface RecommendationResponse {
  summary: string;             // 1-2 sentence intro explaining the picks
  recommendations: Recommendation[];
}

export async function reRankAndExplain(
  intent: ParsedIntent,
  candidates: SearchResult[]
): Promise<RecommendationResponse> {
  const candidateList = candidates
    .map(
      (c, i) =>
        `${i + 1}. "${c.title}" by ${c.author} (${c.genres}, rated ${c.avgRating}/5)\n   ${c.description?.slice(0, 300)}`
    )
    .join("\n\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `You are a thoughtful book recommendation assistant. 

A user asked for: "${intent.cleanedQuery}"

What they're looking for:
- Themes: ${intent.themes.join(", ") || "not specified"}
- Mood: ${intent.mood}
- Pace: ${intent.pace}
- Settings: ${intent.settings.join(", ") || "not specified"}
- Wants to avoid: ${intent.avoidances.join(", ") || "nothing specific"}

Here are candidate books from our catalog (ranked by semantic similarity):

${candidateList}

Your job:
1. Pick the 3-5 books that best match what the user wants
2. Re-rank them by fit (best first)
3. Write a brief, specific reason for each pick that ties directly to what the user asked for
4. Write a 1-2 sentence intro

Respond with ONLY valid JSON, no markdown, no preamble:
{
  "summary": "...",
  "recommendations": [
    {
      "title": "...",
      "author": "...",
      "genres": "...",
      "avgRating": 4.2,
      "reason": "specific reason this fits the user's request"
    }
  ]
}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  try {
    return JSON.parse(text) as RecommendationResponse;
  } catch {
    // Graceful fallback
    return {
      summary: "Here are some books that might interest you.",
      recommendations: candidates.slice(0, 5).map((c) => ({
        title: c.title,
        author: c.author,
        genres: c.genres,
        avgRating: c.avgRating,
        reason: "Matched based on semantic similarity to your request.",
      })),
    };
  }
}

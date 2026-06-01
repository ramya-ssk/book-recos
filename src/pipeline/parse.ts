import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface ParsedIntent {
  cleanedQuery: string;       // typo-fixed version of the raw input
  themes: string[];           // e.g. ["redemption", "loss", "family"]
  mood: string;               // e.g. "dark and introspective"
  pace: string;               // e.g. "slow burn" | "fast-paced" | "moderate"
  settings: string[];         // e.g. ["dystopian future", "small town"]
  avoidances: string[];       // things the user explicitly doesn't want
  embeddingQuery: string;     // optimized query string to embed for vector search
}

export async function parseIntent(rawInput: string): Promise<ParsedIntent> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: `You are a book recommendation assistant. Analyze this user request and extract structured intent from it.

Fix any typos or spelling errors. Then identify what the user is looking for.

User input: "${rawInput}"

Respond with ONLY valid JSON in this exact shape, no markdown, no preamble:
{
  "cleanedQuery": "corrected version of the input",
  "themes": ["theme1", "theme2"],
  "mood": "single mood description",
  "pace": "slow burn | moderate | fast-paced",
  "settings": ["setting1"],
  "avoidances": ["thing to avoid if any"],
  "embeddingQuery": "a rich descriptive paragraph optimized for semantic search that captures all of the above"
}`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  try {
    return JSON.parse(text) as ParsedIntent;
  } catch {
    // Fallback if Claude returns something unexpected
    return {
      cleanedQuery: rawInput,
      themes: [],
      mood: "unknown",
      pace: "moderate",
      settings: [],
      avoidances: [],
      embeddingQuery: rawInput,
    };
  }
}

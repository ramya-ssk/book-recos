import express from "express";
import { parseIntent } from "../pipeline/parse";
import { searchBooks } from "../pipeline/search";
import { reRankAndExplain } from "../pipeline/recommend";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Main recommendation endpoint
// POST /recommend
// Body: { "query": "I want a dark psychological thriller with an unreliable narrator" }
app.post("/recommend", async (req, res) => {
  const { query } = req.body;

  if (!query || typeof query !== "string" || query.trim().length === 0) {
    return res.status(400).json({ error: "query is required" });
  }

  console.log(`\n[recommend] query: "${query}"`);

  try {
    // Step 1: Parse and extract intent
    console.log("  → parsing intent...");
    const intent = await parseIntent(query);
    console.log(`  → intent: mood=${intent.mood}, themes=${intent.themes.join(",")}`);

    // Step 2: Vector similarity search
    console.log("  → searching index...");
    const candidates = await searchBooks(intent.embeddingQuery, 10);
    console.log(`  → found ${candidates.length} candidates`);

    if (candidates.length === 0) {
      return res.status(404).json({
        error: "No matching books found. Try running the scraper and indexer first.",
      });
    }

    // Step 3: Claude re-ranks and explains
    console.log("  → re-ranking with Claude...");
    const result = await reRankAndExplain(intent, candidates);

    return res.json({
      query: intent.cleanedQuery,
      intent: {
        themes: intent.themes,
        mood: intent.mood,
        pace: intent.pace,
        settings: intent.settings,
      },
      ...result,
    });
  } catch (err: any) {
    console.error("Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\nBookRec API running on http://localhost:${PORT}`);
  console.log(`POST /recommend with { "query": "your book request" }\n`);
});

export default app;

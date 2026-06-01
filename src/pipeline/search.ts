import OpenAI from "openai";
import { LocalIndex } from "vectra";
import * as path from "path";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const INDEX_PATH = path.join(__dirname, "../../data/index");

export interface SearchResult {
  bookId: string;
  title: string;
  author: string;
  genres: string;
  avgRating: number;
  description: string;
  score: number; // cosine similarity
}

export async function searchBooks(
  query: string,
  topK: number = 10
): Promise<SearchResult[]> {
  const index = new LocalIndex(INDEX_PATH);

  if (!(await index.isIndexCreated())) {
    throw new Error("Index not found. Run the indexer first: npm run index");
  }

  // Embed the query the same way we embedded the books
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  });
  const queryVector = response.data[0].embedding;

  const results = await index.queryItems(queryVector, "", topK);

  return results.map((r) => ({
    bookId: r.item.metadata.bookId as string,
    title: r.item.metadata.title as string,
    author: r.item.metadata.author as string,
    genres: r.item.metadata.genres as string,
    avgRating: r.item.metadata.avgRating as number,
    description: r.item.metadata.description as string,
    score: r.score,
  }));
}

import * as fs from "fs";
import * as path from "path";
import OpenAI from "openai";
import { LocalIndex } from "vectra";
import { BookReview } from "../scraper/goodreads";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const INDEX_PATH = path.join(__dirname, "../../data/index");
const BOOKS_PATH = path.join(__dirname, "../../data/books.json");

// Build a rich text blob per book that captures all the signal
// the embedding model should reason over
function buildEmbeddingText(book: BookReview): string {
  return [
    `Title: ${book.title}`,
    `Author: ${book.author}`,
    `Genres: ${book.genres.join(", ")}`,
    `Description: ${book.description}`,
    `Reviews: ${book.reviewText}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function embedText(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY environment variable is required");
  }

  if (!fs.existsSync(BOOKS_PATH)) {
    throw new Error(`Books file not found at ${BOOKS_PATH}. Run the scraper first.`);
  }

  const books: BookReview[] = JSON.parse(fs.readFileSync(BOOKS_PATH, "utf-8"));
  console.log(`Loaded ${books.length} books`);

  // Initialize vectra index
  const index = new LocalIndex(INDEX_PATH);
  if (await index.isIndexCreated()) {
    console.log("Deleting existing index...");
    fs.rmSync(INDEX_PATH, { recursive: true });
  }
  await index.createIndex();
  console.log("Created fresh index");

  for (const book of books) {
    console.log(`Embedding: ${book.title}...`);
    const text = buildEmbeddingText(book);

    try {
      const vector = await embedText(text);
      await index.insertItem({
        vector,
        metadata: {
          bookId: book.bookId,
          title: book.title,
          author: book.author,
          genres: book.genres.join(", "),
          avgRating: book.avgRating,
          description: book.description,
        },
      });
      console.log(`  ✓ ${book.title}`);
    } catch (err: any) {
      console.warn(`  ✗ Failed to embed ${book.title}: ${err.message}`);
    }

    // Rate limit: OpenAI embeddings are generous but let's be safe
    await sleep(200);
  }

  console.log(`\nIndexed ${books.length} books to ${INDEX_PATH}`);
}

main().catch(console.error);

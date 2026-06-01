/**
 * UCSD Book Graph Loader
 *
 * Replaces the Goodreads scraper with a local dataset loader.
 * Download the dataset files first from:
 * https://sites.google.com/eng.ucsd.edu/ucsdbookgraph
 *
 * Recommended starting files (genre subsets, much more manageable than the full 2GB):
 *   Mystery/Thriller: goodreads_books_mystery_thriller_crime.json.gz  (~219k books)
 *   Fantasy:          goodreads_books_fantasy_paranormal.json.gz       (~258k books)
 *   Young Adult:      goodreads_books_young_adult.json.gz              (~93k books)
 *   Romance:          goodreads_books_romance.json.gz                  (~335k books)
 *
 * Place the downloaded .json.gz file in the data/ directory, then run:
 *   npm run load -- --file data/goodreads_books_mystery_thriller_crime.json.gz
 *
 * Options:
 *   --file   Path to the .json.gz file (required)
 *   --limit  Max number of books to load (default: 5000)
 *   --min-ratings  Minimum ratings count to include a book (default: 50)
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import * as zlib from "zlib";
import { BookReview } from "./goodreads";

// Raw shape from UCSD dataset
interface UCSDBook {
  book_id: string;
  title: string;
  authors: Array<{ author_id: string; role: string }>;
  description: string;
  genres: Record<string, number>; // shelf_name -> count
  average_rating: string;
  ratings_count: string;
  text_reviews_count: string;
  image_url: string;
  popular_shelves: Array<{ count: string; name: string }>;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      result[args[i].slice(2)] = args[i + 1] ?? "true";
      i++;
    }
  }
  return result;
}

function extractGenres(book: UCSDBook): string[] {
  // popular_shelves gives the most reliable genre signal
  const genreShelves = [
    "fiction", "non-fiction", "nonfiction", "fantasy", "romance",
    "mystery", "thriller", "science-fiction", "sci-fi", "horror",
    "historical-fiction", "biography", "memoir", "young-adult", "ya",
    "literary-fiction", "crime", "adventure", "classics", "contemporary",
    "paranormal", "dystopia", "poetry", "graphic-novels", "children",
  ];

  const genres = (book.popular_shelves || [])
    .filter((s) => genreShelves.some((g) => s.name.toLowerCase().includes(g)))
    .sort((a, b) => parseInt(b.count) - parseInt(a.count))
    .slice(0, 5)
    .map((s) => s.name);

  return genres.length > 0 ? genres : ["fiction"];
}

function ucsdToBookReview(book: UCSDBook, authorMap: Map<string, string>): BookReview {
  const authorId = book.authors?.[0]?.author_id;
  const author = authorId ? authorMap.get(authorId) ?? "Unknown" : "Unknown";

  return {
    bookId: book.book_id,
    title: book.title,
    author,
    genres: extractGenres(book),
    avgRating: parseFloat(book.average_rating) || 0,
    description: book.description || "",
    reviewText: "", // reviews are in a separate file; description is sufficient for embedding
  };
}

async function loadAuthorMap(authorFile: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!fs.existsSync(authorFile)) {
    console.warn(`Author file not found at ${authorFile} — authors will show as "Unknown"`);
    console.warn(`Download goodreads_book_authors.json.gz from the UCSD Book Graph site`);
    return map;
  }

  console.log("Loading author map...");
  const stream = fs.createReadStream(authorFile).pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input: stream });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const author = JSON.parse(trimmed);
      if (author.author_id && author.name) {
        map.set(author.author_id, author.name);
      }
    } catch {}
  }

  console.log(`Loaded ${map.size} authors`);
  return map;
}

async function main() {
  const args = parseArgs();

  const inputFile = args["file"];
  if (!inputFile) {
    console.error(`
Usage: npm run load -- --file <path-to-json.gz> [--limit 5000] [--min-ratings 50]

Download dataset files from:
  https://sites.google.com/eng.ucsd.edu/ucsdbookgraph

Recommended starting point (manageable size):
  goodreads_books_mystery_thriller_crime.json.gz  (219k books)
  goodreads_books_young_adult.json.gz             (93k books)
    `);
    process.exit(1);
  }

  if (!fs.existsSync(inputFile)) {
    console.error(`File not found: ${inputFile}`);
    process.exit(1);
  }

  const limit = parseInt(args["limit"] ?? "5000");
  const minRatings = parseInt(args["min-ratings"] ?? "50");

  console.log(`Loading UCSD Book Graph from: ${inputFile}`);
  console.log(`Settings: limit=${limit}, min-ratings=${minRatings}`);

  // Optionally load author names if the file exists alongside the books file
  const authorFile = path.join(path.dirname(inputFile), "goodreads_book_authors.json.gz");
  const authorMap = await loadAuthorMap(authorFile);

  const books: BookReview[] = [];
  let processed = 0;
  let skipped = 0;

  const stream = fs.createReadStream(inputFile).pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input: stream });

  for await (const line of rl) {
    if (books.length >= limit) break;

    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const raw: UCSDBook = JSON.parse(trimmed);
      processed++;

      // Filter out books without enough signal
      const ratingsCount = parseInt(raw.ratings_count) || 0;
      const hasDescription = raw.description && raw.description.length > 50;

      if (ratingsCount < minRatings || !hasDescription || !raw.title) {
        skipped++;
        continue;
      }

      books.push(ucsdToBookReview(raw, authorMap));

      if (books.length % 500 === 0) {
        console.log(`  Loaded ${books.length} books (processed ${processed}, skipped ${skipped})...`);
      }
    } catch {
      // malformed line, skip
    }
  }

  const outPath = path.join(__dirname, "../../data/books.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(books, null, 2));

  console.log(`\n✓ Saved ${books.length} books to ${outPath}`);
  console.log(`  Processed: ${processed} | Skipped (low signal): ${skipped}`);
  console.log(`\nNext step: npm run index`);
}

main().catch(console.error);
